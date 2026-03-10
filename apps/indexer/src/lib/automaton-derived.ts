import { createHash } from "node:crypto";

import type {
  ChainSlug,
  GridPosition,
  MonologueEntry
} from "@ic-automaton/shared";

import type { IndexerTargetConfig } from "../indexer.config.js";

const GRID_SIZE = 200;

const CORE_PATTERNS: readonly number[][][] = [
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1]
  ],
  [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [1, 2]
  ],
  [
    [0, 0],
    [2, 0],
    [1, 1],
    [0, 2],
    [2, 2]
  ],
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1]
  ],
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1]
  ]
] as const;

const NAME_PREFIXES = [
  "ALPHA",
  "BETA",
  "GAMMA",
  "DELTA",
  "SIGMA",
  "OMEGA",
  "ION",
  "ARC",
  "NOVA",
  "AXIS",
  "MESH",
  "ECHO"
] as const;

const CHAIN_INFO = new Map<number, { explorerBaseUrl: string; slug: ChainSlug }>([
  [1, { slug: "ethereum", explorerBaseUrl: "https://etherscan.io" }],
  [10, { slug: "optimism", explorerBaseUrl: "https://optimistic.etherscan.io" }],
  [137, { slug: "polygon", explorerBaseUrl: "https://polygonscan.com" }],
  [8453, { slug: "base", explorerBaseUrl: "https://basescan.org" }],
  [42161, { slug: "arbitrum", explorerBaseUrl: "https://arbiscan.io" }]
]);

function normalizeHost(host: string) {
  return host.trim().replace(/\/+$/, "");
}

function isIpHost(host: string) {
  const normalized = host.replace(/^\[|\]$/g, "");
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(normalized) || normalized.includes(":");
}

function createSeed(canisterId: string) {
  return createHash("sha256").update(canisterId).digest("hex");
}

export function toVariantName(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }

  if (value && typeof value === "object") {
    const entry = Object.keys(value as Record<string, unknown>)[0];

    if (entry) {
      return entry;
    }
  }

  return fallback;
}

export function toOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function toOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function toOptionalInteger(value: unknown) {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function nsToMs(value: unknown) {
  const parsed = toOptionalNumber(value);
  return parsed === null ? null : Math.floor(parsed / 1_000_000);
}

export function toChainSlug(chainId: number): ChainSlug {
  return CHAIN_INFO.get(chainId)?.slug ?? "base";
}

export function buildExplorerUrl(chainId: number, address: string | null) {
  if (address === null) {
    return null;
  }

  const chain = CHAIN_INFO.get(chainId);
  return chain ? `${chain.explorerBaseUrl}/address/${address}` : null;
}

export function buildCanisterOrigin(config: IndexerTargetConfig, canisterId: string) {
  if (config.network.target === "mainnet") {
    return `https://${canisterId}.icp0.io`;
  }

  const host = normalizeHost(config.network.local.host);
  const port = config.network.local.port;
  return isIpHost(host)
    ? `http://${host}:${port}`
    : `http://${canisterId}.${host}:${port}`;
}

export function buildCanisterUrl(config: IndexerTargetConfig, canisterId: string) {
  if (config.network.target === "mainnet") {
    return buildCanisterOrigin(config, canisterId);
  }

  const host = normalizeHost(config.network.local.host);
  const port = config.network.local.port;
  return isIpHost(host)
    ? `http://${host}:${port}/?canisterId=${encodeURIComponent(canisterId)}`
    : buildCanisterOrigin(config, canisterId);
}

export function buildCanisterApiUrl(
  config: IndexerTargetConfig,
  canisterId: string,
  path: string
) {
  const origin = buildCanisterOrigin(config, canisterId);

  if (config.network.target === "mainnet" || !isIpHost(config.network.local.host)) {
    return `${origin}${path}`;
  }

  const separator = path.includes("?") ? "&" : "?";
  return `${origin}${path}${separator}canisterId=${encodeURIComponent(canisterId)}`;
}

export function computeGridPosition(canisterId: string): GridPosition {
  const seedHex = createSeed(canisterId);
  const seed = Number.parseInt(seedHex.slice(0, 8), 16);

  return {
    x: Math.round((seed % GRID_SIZE) + GRID_SIZE * 0.1),
    y: Math.round((((seed * 2_654_435_761) >>> 0) % GRID_SIZE) + GRID_SIZE * 0.1)
  };
}

export function computeCorePattern(canisterId: string) {
  const seedHex = createSeed(canisterId);
  const index = Number.parseInt(seedHex.slice(0, 4), 16) % CORE_PATTERNS.length;

  return {
    corePatternIndex: index,
    corePattern: CORE_PATTERNS[index].map(([x, y]) => [x, y])
  };
}

export function deriveAutomatonName(canisterId: string) {
  const seedHex = createSeed(canisterId);
  const seed = Number.parseInt(seedHex.slice(4, 12), 16);
  const prefix = NAME_PREFIXES[seed % NAME_PREFIXES.length];
  const suffix = String(seed % 100).padStart(2, "0");
  return `${prefix}-${suffix}`;
}

export function parseHexBalance(value: string | null) {
  if (value === null || value.trim() === "") {
    return 0n;
  }

  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function trimFixed(value: string) {
  return value.replace(/\.?0+$/, "");
}

export function formatFixedDecimal(value: number, digits: number) {
  return trimFixed(value.toFixed(digits));
}

export function computeNetWorth(
  ethBalanceWeiHex: string | null,
  usdcBalanceRawHex: string | null,
  usdcDecimals: number,
  ethUsd: number | null
) {
  const ethBalance = Number(parseHexBalance(ethBalanceWeiHex)) / 1e18;
  const usdcBalance = Number(parseHexBalance(usdcBalanceRawHex)) / 10 ** usdcDecimals;

  if (ethUsd === null) {
    return {
      netWorthEth: null,
      netWorthUsd: null
    } as const;
  }

  const netWorthUsd = ethBalance * ethUsd + usdcBalance;
  const netWorthEth = ethUsd <= 0 ? ethBalance : netWorthUsd / ethUsd;

  return {
    netWorthEth: formatFixedDecimal(netWorthEth, 6),
    netWorthUsd: formatFixedDecimal(netWorthUsd, 2)
  } as const;
}

export function mergeMonologue(
  existingEntries: MonologueEntry[],
  nextEntries: MonologueEntry[]
) {
  const byKey = new Map<string, MonologueEntry>();

  for (const entry of existingEntries) {
    byKey.set(`${entry.timestamp}:${entry.turnId}`, entry);
  }

  for (const entry of nextEntries) {
    byKey.set(`${entry.timestamp}:${entry.turnId}`, entry);
  }

  return [...byKey.values()].sort((left, right) => {
    if (left.timestamp === right.timestamp) {
      return right.turnId.localeCompare(left.turnId);
    }

    return right.timestamp - left.timestamp;
  });
}
