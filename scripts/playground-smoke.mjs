import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexerBaseUrl =
  normalizeOptionalString(process.env.PLAYGROUND_INDEXER_BASE_URL) ??
  "http://127.0.0.1:3001";
const rpcGatewayUrl =
  normalizeOptionalString(process.env.PLAYGROUND_RPC_GATEWAY_URL) ??
  normalizeOptionalString(process.env.PLAYGROUND_PUBLIC_RPC_URL) ??
  "http://127.0.0.1:3002";
const deploymentPath =
  normalizeOptionalString(process.env.LOCAL_EVM_DEPLOYMENT_FILE) ??
  path.join(rootDir, "tmp", "local-escrow-deployment.json");
const smokeOutputPath =
  normalizeOptionalString(process.env.PLAYGROUND_SMOKE_OUTPUT_FILE) ??
  path.join(rootDir, "tmp", "playground-smoke.json");
const spawnGrossAmount = process.env.PLAYGROUND_SMOKE_SPAWN_GROSS_AMOUNT ?? "75000000";
const pollTimeoutMs = parsePositiveInteger(process.env.PLAYGROUND_SMOKE_POLL_TIMEOUT_MS, 120_000);
const pollIntervalMs = parsePositiveInteger(
  process.env.PLAYGROUND_SMOKE_POLL_INTERVAL_MS,
  2_000
);

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length === 0 ? null : normalized;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message, details = undefined) {
  if (condition) {
    return;
  }

  const error = new Error(message);
  if (details !== undefined) {
    error.details = details;
  }
  throw error;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const body = text.length > 0 ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`request failed with ${response.status} ${response.statusText}`);
    error.details = body;
    throw error;
  }

  return body;
}

async function rpc(method, params = []) {
  const response = await fetchJson(activeRpcUrl, {
    method: "POST",
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });

  if (response?.error) {
    const error = new Error(`${method} failed: ${response.error.message}`);
    error.details = response.error;
    throw error;
  }

  return response.result;
}

function runExistingEscrowSmoke() {
  const result = spawnSync(process.execPath, [path.join(rootDir, "scripts", "smoke-local-escrow.mjs")], {
    cwd: rootDir,
    env: process.env,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(
      `smoke-local-escrow.mjs failed:\n${result.stderr || result.stdout || "unknown failure"}`
    );
  }

  return JSON.parse(result.stdout.trim());
}

function runCast(args) {
  return execFileSync("cast", args, {
    cwd: rootDir,
    encoding: "utf8"
  }).trim();
}

function createEphemeralWallet() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const privateKey = `0x${randomBytes(32).toString("hex")}`;

    try {
      const address = runCast(["wallet", "address", "--private-key", privateKey]);
      return {
        privateKey,
        address: address.toLowerCase()
      };
    } catch {}
  }

  throw new Error("failed to derive a valid ephemeral wallet");
}

function sendContractTransaction({ privateKey, to, signature, args }) {
  const output = runCast([
    "send",
    "--async",
    "--rpc-url",
    activeRpcUrl,
    "--private-key",
    privateKey,
    to,
    signature,
    ...args
  ]);
  const match = output.match(/0x[a-fA-F0-9]{64}/);
  assert(match !== null, "cast send did not return a transaction hash", { output });
  return match[0];
}

async function waitForReceipt(txHash) {
  const deadline = Date.now() + pollTimeoutMs;

  while (Date.now() < deadline) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt !== null) {
      return receipt;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`timed out waiting for receipt ${txHash}`);
}

async function waitForSessionCompletion(sessionId) {
  const deadline = Date.now() + pollTimeoutMs;
  let lastDetail = null;

  while (Date.now() < deadline) {
    const detail = await fetchJson(`${indexerBaseUrl}/api/spawn-sessions/${sessionId}`);
    lastDetail = detail;

    if (
      detail?.session?.state === "complete" &&
      detail?.registryRecord?.canisterId
    ) {
      return detail;
    }

    if (detail?.session?.state === "failed" || detail?.session?.state === "expired") {
      const error = new Error(`spawn session ${sessionId} ended in ${detail.session.state}`);
      error.details = detail;
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const error = new Error(`timed out waiting for spawn session ${sessionId} to complete`);
  error.details = lastDetail;
  throw error;
}

function writeOutput(summary) {
  fs.mkdirSync(path.dirname(smokeOutputPath), { recursive: true });
  fs.writeFileSync(smokeOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (!fs.existsSync(deploymentPath)) {
  throw new Error(`missing deployment file: ${deploymentPath}`);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const health = await fetchJson(`${indexerBaseUrl}/health`);
assert(health?.ok === true, "indexer health returned a non-ok payload", health);
assert(
  health?.discovery?.factoryConfigured === true,
  "indexer health reports that the factory client is not configured",
  health
);

const metadata = await fetchJson(`${indexerBaseUrl}/api/playground`);
assert(metadata?.chain?.id, "playground metadata is missing chain information", metadata);
assert(metadata?.faucet?.available === true, "playground metadata reports faucet unavailable", metadata);
const activeRpcUrl = normalizeOptionalString(metadata?.chain?.publicRpcUrl) ?? rpcGatewayUrl;

const gatewayChainIdHex = await rpc("eth_chainId");
const gatewayBlockNumberHex = await rpc("eth_blockNumber");
const gatewayChainId = Number.parseInt(gatewayChainIdHex, 16);

assert(
  gatewayChainId === metadata.chain.id,
  "rpc gateway chain id does not match indexer playground metadata",
  {
    gatewayChainIdHex,
    gatewayChainId,
    metadataChainId: metadata.chain.id
  }
);

const escrowSmoke = runExistingEscrowSmoke();
const smokeWallet = createEphemeralWallet();
const faucetClaim = await fetchJson(`${indexerBaseUrl}/api/playground/faucet`, {
  method: "POST",
  body: JSON.stringify({
    walletAddress: smokeWallet.address
  })
});

assert(faucetClaim?.ok === true, "faucet claim did not succeed", faucetClaim);

const createSessionResponse = await fetchJson(`${indexerBaseUrl}/api/spawn-sessions`, {
  method: "POST",
  body: JSON.stringify({
    stewardAddress: smokeWallet.address,
    asset: "usdc",
    grossAmount: spawnGrossAmount,
    config: {
      chain: "base",
      risk: 5,
      strategies: [],
      skills: [],
      provider: {
        openRouterApiKey: null,
        model: null,
        braveSearchApiKey: null
      }
    },
    parentId: null
  })
});

const payment = createSessionResponse?.quote?.payment;
assert(payment?.claimId, "spawn session response did not include payment instructions", createSessionResponse);

const usdcAddress = deployment.usdcTokenAddress ?? deployment.mockUsdcAddress;
assert(typeof usdcAddress === "string" && usdcAddress.length > 0, "deployment is missing USDC address", deployment);

const approvalTxHash = sendContractTransaction({
  privateKey: smokeWallet.privateKey,
  to: usdcAddress,
  signature: "approve(address,uint256)",
  args: [payment.paymentAddress, payment.grossAmount]
});
await waitForReceipt(approvalTxHash);

const depositTxHash = sendContractTransaction({
  privateKey: smokeWallet.privateKey,
  to: payment.paymentAddress,
  signature: "deposit(bytes32,uint256)",
  args: [payment.claimId, payment.grossAmount]
});
await waitForReceipt(depositTxHash);

const completedSession = await waitForSessionCompletion(createSessionResponse.session.sessionId);
const registryRecord = await fetchJson(
  `${indexerBaseUrl}/api/spawned-automatons/${completedSession.registryRecord.canisterId}`
);

const summary = {
  ok: true,
  indexer: {
    baseUrl: indexerBaseUrl,
    health: {
      factoryCanisterId: health.discovery.factoryCanisterId,
      factoryConfigured: health.discovery.factoryConfigured
    }
  },
  rpcGateway: {
    url: activeRpcUrl,
    chainId: gatewayChainId,
    chainIdHex: gatewayChainIdHex,
    blockNumberHex: gatewayBlockNumberHex
  },
  playground: {
    environmentLabel: metadata.environmentLabel,
    environmentVersion: metadata.environmentVersion,
    maintenance: metadata.maintenance,
    chainId: metadata.chain.id
  },
  escrowSmoke,
  faucetClaim,
  spawnSmoke: {
    walletAddress: smokeWallet.address,
    sessionId: createSessionResponse.session.sessionId,
    claimId: payment.claimId,
    approvalTxHash,
    depositTxHash,
    finalState: completedSession.session.state,
    paymentStatus: completedSession.session.paymentStatus,
    automatonCanisterId: completedSession.session.automatonCanisterId,
    releaseTxHash: completedSession.session.releaseTxHash,
    registryRecord
  }
};

writeOutput(summary);
