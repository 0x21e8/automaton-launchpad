import type { SpawnChain } from "@ic-automaton/shared";

const BASE_CHAIN_ID = 8453;
const DEFAULT_BASE_USDC_CONTRACT_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ESCROW_DEPOSIT_SELECTOR = "0x1de26e16";

export function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

export function bigintToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function encodeAddressHex(address: string): string | null {
  const stripped = stripHexPrefix(address.trim());
  if (!/^[0-9a-fA-F]{40}$/.test(stripped)) {
    return null;
  }

  return stripped.toLowerCase().padStart(64, "0");
}

function encodeBytes32Hex(value: string): string | null {
  const stripped = stripHexPrefix(value.trim());
  if (!/^[0-9a-fA-F]{64}$/.test(stripped)) {
    return null;
  }

  return stripped.toLowerCase();
}

function encodeUint256Hex(amount: bigint): string {
  return amount.toString(16).padStart(64, "0");
}

export function encodeErc20TransferData(
  recipient: string,
  amount: bigint
): string | null {
  const encodedRecipient = encodeAddressHex(recipient);

  if (encodedRecipient === null) {
    return null;
  }

  return `${ERC20_TRANSFER_SELECTOR}${encodedRecipient}${encodeUint256Hex(amount)}`;
}

export function encodeErc20ApproveData(
  spender: string,
  amount: bigint
): string | null {
  const encodedSpender = encodeAddressHex(spender);

  if (encodedSpender === null) {
    return null;
  }

  return `${ERC20_APPROVE_SELECTOR}${encodedSpender}${encodeUint256Hex(amount)}`;
}

export function encodeEscrowDepositData(
  claimId: string,
  amount: bigint
): string | null {
  const encodedClaimId = encodeBytes32Hex(claimId);

  if (encodedClaimId === null) {
    return null;
  }

  return `${ESCROW_DEPOSIT_SELECTOR}${encodedClaimId}${encodeUint256Hex(amount)}`;
}

export function parseDecimalAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();

  if (normalized === "" || decimals < 0) {
    return null;
  }

  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (match === null) {
    return null;
  }

  const whole = match[1];
  const fraction = match[2] ?? "";

  if (fraction.length > decimals) {
    return null;
  }

  const scaledWhole = BigInt(whole) * 10n ** BigInt(decimals);
  const scaledFraction = fraction === "" ? 0n : BigInt(fraction.padEnd(decimals, "0"));

  return scaledWhole + scaledFraction;
}

export function resolveSpawnChainId(chain: SpawnChain): number | null {
  switch (chain) {
    case "base":
      return BASE_CHAIN_ID;
    default:
      return null;
  }
}

export function resolveSpawnUsdcContractAddress(
  chain: SpawnChain,
  env: Record<string, string | undefined> = import.meta.env
): string | null {
  const configured = env.VITE_SPAWN_USDC_CONTRACT_ADDRESS?.trim();
  if (configured) {
    return configured;
  }

  switch (chain) {
    case "base":
      return DEFAULT_BASE_USDC_CONTRACT_ADDRESS;
    default:
      return null;
  }
}
