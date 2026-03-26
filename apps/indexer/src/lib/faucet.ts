import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type {
  PlaygroundClaimAssetAmount,
  PlaygroundMetadata
} from "@ic-automaton/shared";

import type { FaucetClaimWindowStats, IndexerStore } from "../store/sqlite.js";

const execFileAsync = promisify(execFile);
const SEED_SCRIPT_PATH = fileURLToPath(
  new URL("../../../../scripts/seed-local-wallet.mjs", import.meta.url)
);
const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const ETH_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

interface SeedLocalWalletSummary {
  walletAddress: string;
  mintTxHash: string;
  fundTxHash: string;
  balances: {
    ethWei: string;
    usdcRaw: string;
  };
}

export interface FaucetClaimInput {
  ipAddress: string;
  walletAddress: unknown;
}

export interface FaucetClaimResult {
  ok: true;
  walletAddress: string;
  txHashes: {
    eth: string;
    usdc: string;
  };
  fundedAmounts: {
    eth: {
      amount: string;
      decimals: number;
      wei: string;
    };
    usdc: {
      amount: string;
      decimals: number;
      raw: string;
    };
  };
  balances: {
    ethWei: string;
    usdcRaw: string;
  };
}

export interface FaucetSeedInput {
  walletAddress: string;
  ethAmount: PlaygroundClaimAssetAmount;
  usdcAmount: PlaygroundClaimAssetAmount;
}

export type FaucetSeedRunner = (input: FaucetSeedInput) => Promise<SeedLocalWalletSummary>;

export interface FaucetService {
  claim(input: FaucetClaimInput): Promise<FaucetClaimResult>;
}

export class FaucetError extends Error {
  readonly statusCode: number;
  readonly body: Record<string, unknown>;

  constructor(statusCode: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : "Faucet request failed.");
    this.statusCode = statusCode;
    this.body = body;
  }
}

function decimalToBaseUnits(value: string, decimals: number) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} exceeds ${decimals} decimal places.`);
  }

  return `${whole}${fraction.padEnd(decimals, "0")}`.replace(/^0+(?=\d)/, "");
}

function requireClaimAssetAmount(
  claimAssetAmounts: PlaygroundMetadata["faucet"]["claimAssetAmounts"],
  asset: PlaygroundClaimAssetAmount["asset"]
) {
  const claimAssetAmount = claimAssetAmounts.find((entry) => entry.asset === asset);
  if (!claimAssetAmount) {
    throw new Error(`Playground faucet metadata is missing the ${asset} claim amount.`);
  }

  return claimAssetAmount;
}

function parseSeedSummary(output: string): SeedLocalWalletSummary {
  const parsed = JSON.parse(output) as {
    balances?: {
      ethWei?: unknown;
      usdcRaw?: unknown;
    };
    fundTxHash?: unknown;
    mintTxHash?: unknown;
    walletAddress?: unknown;
  };

  if (
    typeof parsed.walletAddress !== "string" ||
    typeof parsed.mintTxHash !== "string" ||
    typeof parsed.fundTxHash !== "string" ||
    typeof parsed.balances?.ethWei !== "string" ||
    typeof parsed.balances?.usdcRaw !== "string"
  ) {
    throw new Error("seed-local-wallet script returned an unexpected JSON payload.");
  }

  return {
    walletAddress: parsed.walletAddress,
    mintTxHash: parsed.mintTxHash,
    fundTxHash: parsed.fundTxHash,
    balances: {
      ethWei: parsed.balances.ethWei,
      usdcRaw: parsed.balances.usdcRaw
    }
  };
}

export function normalizeWalletAddress(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!ETH_ADDRESS_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

export function hashIpAddress(ipAddress: string) {
  return createHash("sha256").update(ipAddress).digest("hex");
}

function retryAfterSeconds(stats: FaucetClaimWindowStats, windowMs: number, now: number) {
  if (stats.oldestClaimAt === null) {
    return null;
  }

  return Math.max(1, Math.ceil((stats.oldestClaimAt + windowMs - now) / 1_000));
}

async function defaultFaucetSeedRunner(input: FaucetSeedInput): Promise<SeedLocalWalletSummary> {
  const outputPath = join(tmpdir(), `automaton-faucet-${randomUUID()}.json`);
  const usdcRawAmount = decimalToBaseUnits(input.usdcAmount.amount, input.usdcAmount.decimals);

  try {
    const { stdout } = await execFileAsync(process.execPath, [SEED_SCRIPT_PATH], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        LOCAL_EVM_FUND_FACTORY_SIGNER: "0",
        LOCAL_EVM_SEED_ETH: input.ethAmount.amount,
        LOCAL_EVM_SEED_OUTPUT_FILE: outputPath,
        LOCAL_EVM_SEED_USDC: usdcRawAmount,
        LOCAL_EVM_WALLET_ADDRESS: input.walletAddress
      }
    });

    return parseSeedSummary(stdout.trim());
  } finally {
    await rm(outputPath, {
      force: true
    }).catch(() => undefined);
  }
}

export function createFaucetService(options: {
  metadata: PlaygroundMetadata["faucet"];
  seedWallet?: FaucetSeedRunner;
  store: IndexerStore;
}) {
  const seedWallet = options.seedWallet ?? defaultFaucetSeedRunner;
  const ethAmount = requireClaimAssetAmount(options.metadata.claimAssetAmounts, "eth");
  const usdcAmount = requireClaimAssetAmount(options.metadata.claimAssetAmounts, "usdc");
  const ethAmountWei = decimalToBaseUnits(ethAmount.amount, ethAmount.decimals);
  const usdcAmountRaw = decimalToBaseUnits(usdcAmount.amount, usdcAmount.decimals);

  return {
    async claim(input: FaucetClaimInput): Promise<FaucetClaimResult> {
      if (!options.metadata.available) {
        throw new FaucetError(503, {
          ok: false,
          error: "Playground faucet is not available."
        });
      }

      const walletAddress = normalizeWalletAddress(input.walletAddress);
      if (walletAddress === null) {
        throw new FaucetError(400, {
          ok: false,
          error: "walletAddress must be a valid EVM address."
        });
      }

      const now = Date.now();
      const windowMs = options.metadata.claimLimits.windowSeconds * 1_000;
      const since = now - windowMs;
      const ipHash = hashIpAddress(input.ipAddress);
      const [walletStats, ipStats] = await Promise.all([
        options.store.getFaucetClaimWindowStats({
          walletAddress,
          since
        }),
        options.store.getFaucetClaimWindowStats({
          ipHash,
          since
        })
      ]);

      if (walletStats.count >= options.metadata.claimLimits.maxClaimsPerWallet) {
        throw new FaucetError(429, {
          ok: false,
          error: "Faucet wallet claim limit exceeded.",
          retryAfterSeconds: retryAfterSeconds(walletStats, windowMs, now),
          walletAddress,
          windowSeconds: options.metadata.claimLimits.windowSeconds
        });
      }

      if (ipStats.count >= options.metadata.claimLimits.maxClaimsPerIp) {
        throw new FaucetError(429, {
          ok: false,
          error: "Faucet IP claim limit exceeded.",
          retryAfterSeconds: retryAfterSeconds(ipStats, windowMs, now),
          windowSeconds: options.metadata.claimLimits.windowSeconds
        });
      }

      let seededWallet: SeedLocalWalletSummary;
      try {
        seededWallet = await seedWallet({
          walletAddress,
          ethAmount,
          usdcAmount
        });
      } catch (error) {
        throw new FaucetError(502, {
          ok: false,
          error: "Faucet funding failed."
        });
      }

      await options.store.recordFaucetClaim({
        walletAddress,
        ipHash,
        claimedAt: now,
        ethAmount: ethAmount.amount,
        usdcAmount: usdcAmount.amount,
        txSummary: {
          balances: seededWallet.balances,
          txHashes: {
            eth: seededWallet.fundTxHash,
            usdc: seededWallet.mintTxHash
          },
          walletAddress
        }
      });

      return {
        ok: true,
        walletAddress,
        txHashes: {
          eth: seededWallet.fundTxHash,
          usdc: seededWallet.mintTxHash
        },
        fundedAmounts: {
          eth: {
            amount: ethAmount.amount,
            decimals: ethAmount.decimals,
            wei: ethAmountWei
          },
          usdc: {
            amount: usdcAmount.amount,
            decimals: usdcAmount.decimals,
            raw: usdcAmountRaw
          }
        },
        balances: seededWallet.balances
      };
    }
  } satisfies FaucetService;
}
