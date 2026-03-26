import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evmRoot = path.join(rootDir, "evm");
const rpcUrl = process.env.LOCAL_EVM_RPC_URL ?? "http://127.0.0.1:8545";
const evmMode = (process.env.LOCAL_EVM_MODE ?? "base-fork").trim().toLowerCase();
const deployer =
  process.env.LOCAL_EVM_DEPLOYER ?? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const releaser = process.env.LOCAL_EVM_RELEASER ?? deployer;
const canonicalBaseUsdcAddress =
  process.env.LOCAL_EVM_USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const outputPath =
  process.env.LOCAL_EVM_DEPLOYMENT_FILE ??
  path.join(rootDir, "tmp", "local-escrow-deployment.json");
const expectedChainId = normalizeOptionalInteger(process.env.LOCAL_EVM_EXPECT_CHAIN_ID);

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

execFileSync("forge", ["build", "--root", evmRoot], {
  cwd: rootDir,
  stdio: "inherit"
});

function readArtifactBytecode(relativePath) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(evmRoot, "out", relativePath), "utf8")
  );
  return artifact.bytecode.object;
}

function readArtifactDeployedBytecode(relativePath) {
  const artifact = JSON.parse(
    fs.readFileSync(path.join(evmRoot, "out", relativePath), "utf8")
  );
  return artifact.deployedBytecode.object;
}

function abiEncode(signature, args) {
  return execFileSync("cast", ["abi-encode", signature, ...args], {
    cwd: rootDir,
    encoding: "utf8"
  }).trim();
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

async function deploy(bytecode, constructorEncoding = "0x") {
  const txHash = await rpc("eth_sendTransaction", [
    {
      from: deployer,
      data: `${bytecode}${constructorEncoding.slice(2)}`
    }
  ]);
  const receipt = await waitForReceipt(txHash);
  if (!receipt.contractAddress) {
    throw new Error(`deployment receipt missing contractAddress for ${txHash}`);
  }
  return receipt.contractAddress;
}

async function setCode(address, bytecode) {
  await rpc("anvil_setCode", [address, bytecode]);
}

let usdcAddress;
let usdcLabel;
let usdcBytecodeInjected = false;

switch (evmMode) {
  case "local": {
    const usdcBytecode = readArtifactBytecode("MockUSDC.sol/MockUSDC.json");
    usdcAddress = await deploy(usdcBytecode);
    usdcLabel = "MockUSDC";
    break;
  }
  case "base-fork": {
    const deployedBytecode = readArtifactDeployedBytecode("MockUSDC.sol/MockUSDC.json");
    await setCode(canonicalBaseUsdcAddress, deployedBytecode);
    usdcAddress = canonicalBaseUsdcAddress;
    usdcLabel = "BaseUSDC";
    usdcBytecodeInjected = true;
    break;
  }
  default:
    throw new Error(
      `unsupported LOCAL_EVM_MODE=${JSON.stringify(
        evmMode
      )}; expected "local" or "base-fork"`
    );
}

const escrowBytecode = readArtifactBytecode("LocalEscrow.sol/LocalEscrow.json");
const constructorEncoding = abiEncode("constructor(address,address)", [usdcAddress, releaser]);
const escrowAddress = await deploy(escrowBytecode, constructorEncoding);

const chainId = Number.parseInt(await rpc("eth_chainId", []), 16);

if (expectedChainId !== null && chainId !== expectedChainId) {
  throw new Error(
    `unexpected chain id ${chainId}; expected ${expectedChainId}.`
  );
}

const deployment = {
  rpcUrl,
  chainId,
  evmMode,
  deployer,
  releaser,
  usdcLabel,
  usdcTokenAddress: usdcAddress,
  canonicalBaseUsdcAddress,
  usdcBytecodeInjected,
  mockUsdcAddress: escrowAddress ? usdcAddress : "",
  escrowContractAddress: escrowAddress,
  paymentAddress: escrowAddress,
  factoryInit: {
    payment_address: escrowAddress,
    escrow_contract_address: escrowAddress,
    base_rpc_endpoint: rpcUrl
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(deployment, null, 2)}\n`);
