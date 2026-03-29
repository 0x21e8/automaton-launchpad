import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deploymentPath =
  process.env.LOCAL_EVM_DEPLOYMENT_FILE ??
  path.join(rootDir, "tmp", "local-escrow-deployment.json");
const smokeOutput =
  process.env.LOCAL_EVM_SMOKE_OUTPUT_FILE ??
  path.join(rootDir, "tmp", "local-escrow-smoke.json");
const sessionId =
  process.env.LOCAL_EVM_SESSION_ID ?? "550e8400-e29b-41d4-a716-446655440000";
const payer =
  process.env.LOCAL_EVM_PAYER ?? "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const recipient =
  process.env.LOCAL_EVM_RECIPIENT ?? "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const depositAmount = process.env.LOCAL_EVM_SMOKE_AMOUNT ?? "75000000";

if (!fs.existsSync(deploymentPath)) {
  throw new Error(`missing deployment file: ${deploymentPath}`);
}

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const rpcUrl = deployment.rpcUrl;
const usdcAddress = deployment.usdcTokenAddress ?? deployment.mockUsdcAddress;
const escrowAddress = deployment.escrowContractAddress;
const releaser = deployment.releaser;

function runCast(args) {
  return execFileSync("cast", args, {
    cwd: rootDir,
    encoding: "utf8"
  }).trim();
}

function calldata(signature, args) {
  return runCast(["calldata", signature, ...args]);
}

function keccak(data) {
  return runCast(["keccak", data]);
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params
    })
  });
  const body = await response.json();
  if (body.error) {
    throw new Error(`${method} failed: ${body.error.message}`);
  }
  return body.result;
}

async function waitForReceipt(txHash) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const receipt = await rpc("eth_getTransactionReceipt", [txHash]);
    if (receipt !== null) {
      return receipt;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`timed out waiting for receipt ${txHash}`);
}

async function sendTransaction({ from, to, data }) {
  const txHash = await rpc("eth_sendTransaction", [
    { from, to, data }
  ]);
  await waitForReceipt(txHash);
  return txHash;
}

async function callUint(to, data) {
  const result = await rpc("eth_call", [{ to, data }, "latest"]);
  return BigInt(result).toString();
}

const claimId = keccak(sessionId);
const depositedTopic = keccak("Deposited(bytes32,address,uint256)");

const mintTxHash = await sendTransaction({
  from: releaser,
  to: usdcAddress,
  data: calldata("mint(address,uint256)", [payer, depositAmount])
});

const approveTxHash = await sendTransaction({
  from: payer,
  to: usdcAddress,
  data: calldata("approve(address,uint256)", [escrowAddress, depositAmount])
});

const depositTxHash = await sendTransaction({
  from: payer,
  to: escrowAddress,
  data: calldata("deposit(bytes32,uint256)", [claimId, depositAmount])
});
const depositReceipt = await waitForReceipt(depositTxHash);

const logs = await rpc("eth_getLogs", [
  {
    address: escrowAddress,
    fromBlock: depositReceipt.blockNumber,
    toBlock: depositReceipt.blockNumber,
    topics: [depositedTopic, [claimId]]
  }
]);

const releaseTxHash = await sendTransaction({
  from: releaser,
  to: escrowAddress,
  data: calldata("release(bytes32,address)", [claimId, recipient])
});

const recipientBalance = await callUint(
  usdcAddress,
  calldata("balanceOf(address)", [recipient])
);
const remainingClaimBalance = await callUint(
  escrowAddress,
  calldata("claimBalances(bytes32)", [claimId])
);

const summary = {
  sessionId,
  claimId,
  depositAmount,
  mintTxHash,
  approveTxHash,
  depositTxHash,
  releaseTxHash,
  depositLogCount: logs.length,
  recipientBalance,
  remainingClaimBalance
};

fs.mkdirSync(path.dirname(smokeOutput), { recursive: true });
fs.writeFileSync(smokeOutput, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
