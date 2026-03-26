import type {
  PlaygroundMetadata,
  SpawnPaymentInstructions,
  SpawnSession
} from "@ic-automaton/shared";

import type { WalletTransport } from "./wallet-transport";
import {
  bigintToHex,
  encodeErc20ApproveData,
  encodeEscrowDepositData,
  parseDecimalAmount,
  resolveSpawnChainId,
  resolveSpawnChainMetadata,
  resolveSpawnUsdcContractAddress
} from "./wallet-transaction-helpers";

const USDC_DECIMALS = 6;

export interface SpawnPaymentWalletState {
  address: string | null;
  chainId: number | null;
}

export interface SpawnPaymentAvailability {
  canSubmit: boolean;
  disabledReason: string | null;
  expectedChainId: number | null;
}

export interface SpawnPaymentExecutionResult {
  approvalTxHash: string;
  paymentTxHash: string;
}

const UNKNOWN_CHAIN_ERROR_CODE = 4902;
const USER_REJECTED_REQUEST_ERROR_CODE = 4001;

class SpawnPaymentError extends Error {
  readonly kind:
    | "chain_add_rejected"
    | "chain_add_failed"
    | "chain_switch_rejected"
    | "insufficient_eth"
    | "insufficient_usdc"
    | "quote_expired";

  constructor(kind: SpawnPaymentError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function isProviderErrorWithCode(error: unknown, code: number) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

async function requestWalletChainSwitch(
  chainId: number,
  transport: WalletTransport
) {
  await transport.request({
    method: "wallet_switchEthereumChain",
    params: [{ chainId: toHexChainId(chainId) }]
  });
}

export async function connectWalletToSpawnChain(
  chain: SpawnSession["chain"],
  transport: WalletTransport,
  playgroundMetadata: PlaygroundMetadata | null = null,
  env: Record<string, string | undefined>
) {
  const chainMetadata = resolveSpawnChainMetadata(chain, playgroundMetadata, env);

  if (chainMetadata === null) {
    return;
  }

  try {
    await requestWalletChainSwitch(chainMetadata.chainId, transport);
  } catch (error) {
    const isUnknownChain = isProviderErrorWithCode(error, UNKNOWN_CHAIN_ERROR_CODE);

    if (!isUnknownChain) {
      if (isProviderErrorWithCode(error, USER_REJECTED_REQUEST_ERROR_CODE)) {
        throw new SpawnPaymentError(
          "chain_switch_rejected",
          `Wallet rejected switching to ${chainMetadata.chainName}.`
        );
      }

      throw error;
    }

    if (chainMetadata.rpcUrl === null) {
      throw new SpawnPaymentError(
        "chain_add_failed",
        `Wallet is missing chain ${chainMetadata.chainId} and no RPC URL is configured to add it.`
      );
    }

    try {
      await transport.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHexChainId(chainMetadata.chainId),
            chainName: chainMetadata.chainName,
            rpcUrls: [chainMetadata.rpcUrl],
            nativeCurrency: {
              name: chainMetadata.currencyName,
              symbol: chainMetadata.currencySymbol,
              decimals: 18
            },
            blockExplorerUrls:
              chainMetadata.blockExplorerUrl === null ? [] : [chainMetadata.blockExplorerUrl]
          }
        ]
      });
    } catch (addChainError) {
      if (isProviderErrorWithCode(addChainError, USER_REJECTED_REQUEST_ERROR_CODE)) {
        throw new SpawnPaymentError(
          "chain_add_rejected",
          `Wallet rejected adding ${chainMetadata.chainName}.`
        );
      }

      throw new SpawnPaymentError(
        "chain_add_failed",
        `Wallet could not add ${chainMetadata.chainName}.`
      );
    }

    try {
      await requestWalletChainSwitch(chainMetadata.chainId, transport);
    } catch (switchChainError) {
      if (isProviderErrorWithCode(switchChainError, USER_REJECTED_REQUEST_ERROR_CODE)) {
        throw new SpawnPaymentError(
          "chain_switch_rejected",
          `Wallet rejected switching to ${chainMetadata.chainName}.`
        );
      }

      throw switchChainError;
    }
  }
}

function createAvailability(
  canSubmit: boolean,
  disabledReason: string | null,
  expectedChainId: number | null
): SpawnPaymentAvailability {
  return {
    canSubmit,
    disabledReason,
    expectedChainId
  };
}

export function getSpawnPaymentAvailability(
  session: SpawnSession | null,
  payment: SpawnPaymentInstructions | null,
  wallet: SpawnPaymentWalletState,
  playgroundMetadata: PlaygroundMetadata | null = null,
  env: Record<string, string | undefined> = import.meta.env
): SpawnPaymentAvailability {
  if (session === null || payment === null) {
    return createAvailability(false, "Payment instructions are not available yet.", null);
  }

  const expectedChainId = resolveSpawnChainId(session.chain, playgroundMetadata, env);

  if (session.state !== "awaiting_payment") {
    return createAvailability(
      false,
      "Wallet payment is only available while the session is awaiting payment.",
      expectedChainId
    );
  }

  if (session.paymentStatus === "partial") {
    return createAvailability(
      false,
      "Partial payments require manual recovery. The wizard only submits the original quoted amount once.",
      expectedChainId
    );
  }

  if (session.paymentStatus === "paid" || session.paymentStatus === "refunded") {
    return createAvailability(
      false,
      "Payment was already settled for this session.",
      expectedChainId
    );
  }

  if (wallet.address === null) {
    return createAvailability(false, "Connect a wallet to pay for this spawn.", expectedChainId);
  }

  if (expectedChainId === null) {
    return createAvailability(false, `Unsupported payment chain: ${session.chain}.`, null);
  }

  if (wallet.chainId !== expectedChainId) {
    return createAvailability(
      false,
      `Switch the connected wallet to chain ${expectedChainId} before paying.`,
      expectedChainId
    );
  }

  if (payment.asset === "usdc" && resolveSpawnUsdcContractAddress(session.chain, env) === null) {
    return createAvailability(
      false,
      `USDC contract address is not configured for ${session.chain}.`,
      expectedChainId
    );
  }

  return createAvailability(true, null, expectedChainId);
}

export function formatSpawnPaymentError(error: unknown): string {
  if (error instanceof SpawnPaymentError) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === USER_REJECTED_REQUEST_ERROR_CODE
  ) {
    return "Wallet rejected the payment transaction.";
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();

    if (
      normalized.includes("insufficient funds") &&
      normalized.includes("gas")
    ) {
      return "Connected wallet does not have enough ETH to cover playground gas.";
    }

    if (
      normalized.includes("transfer amount exceeds balance") ||
      normalized.includes("insufficient balance") ||
      normalized.includes("erc20")
    ) {
      return "Connected wallet does not have enough USDC for the quoted deposit.";
    }

    if (
      normalized.includes("expired") ||
      normalized.includes("quote ttl")
    ) {
      return new SpawnPaymentError(
        "quote_expired",
        "This spawn session expired before payment completed. Create a new session if the quote TTL elapsed or the playground reset."
      ).message;
    }
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }

  return "Spawn payment failed.";
}

export async function executeSpawnPayment(
  payment: SpawnPaymentInstructions,
  walletAddress: string,
  transport: WalletTransport,
  playgroundMetadata: PlaygroundMetadata | null = null,
  env: Record<string, string | undefined> = import.meta.env
): Promise<SpawnPaymentExecutionResult> {
  await connectWalletToSpawnChain(payment.chain, transport, playgroundMetadata, env);

  switch (payment.asset) {
    case "usdc": {
      const tokenAddress = resolveSpawnUsdcContractAddress(payment.chain, env);
      if (tokenAddress === null) {
        throw new Error(`USDC contract address is not configured for ${payment.chain}.`);
      }

      const amount = parseDecimalAmount(payment.grossAmount, USDC_DECIMALS);
      if (amount === null) {
        throw new Error(`Invalid USDC payment amount: ${payment.grossAmount}`);
      }

      const approveData = encodeErc20ApproveData(payment.paymentAddress, amount);
      if (approveData === null) {
        throw new Error("Unable to encode the USDC approval transaction.");
      }

      const depositData = encodeEscrowDepositData(payment.claimId, amount);
      if (depositData === null) {
        throw new Error("Unable to encode the escrow deposit transaction.");
      }

      const approvalTxHash = await transport.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: walletAddress,
            to: tokenAddress,
            data: approveData,
            value: bigintToHex(0n)
          }
        ]
      });

      const paymentTxHash = await transport.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: walletAddress,
            to: payment.paymentAddress,
            data: depositData,
            value: bigintToHex(0n)
          }
        ]
      });

      return {
        approvalTxHash,
        paymentTxHash
      };
    }
    default:
      throw new Error(`Unsupported spawn payment asset: ${payment.asset}`);
  }
}
