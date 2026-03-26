import type {
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

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

async function ensureWalletChain(
  chain: SpawnSession["chain"],
  transport: WalletTransport,
  env: Record<string, string | undefined>
) {
  const chainMetadata = resolveSpawnChainMetadata(chain, env);

  if (chainMetadata === null) {
    return;
  }

  if (chainMetadata.rpcUrl !== null) {
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
  }

  try {
    await transport.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHexChainId(chainMetadata.chainId) }]
    });
  } catch (error) {
    const isUnknownChain =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === UNKNOWN_CHAIN_ERROR_CODE;

    if (!isUnknownChain || chainMetadata.rpcUrl !== null) {
      throw error;
    }

    throw new Error(
      `Wallet is missing chain ${chainMetadata.chainId} and no RPC URL is configured to add it.`
    );
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
  env: Record<string, string | undefined> = import.meta.env
): SpawnPaymentAvailability {
  if (session === null || payment === null) {
    return createAvailability(false, "Payment instructions are not available yet.", null);
  }

  const expectedChainId = resolveSpawnChainId(session.chain);

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
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 4001
  ) {
    return "Wallet rejected the payment transaction.";
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
  env: Record<string, string | undefined> = import.meta.env
): Promise<SpawnPaymentExecutionResult> {
  await ensureWalletChain(payment.chain, transport, env);

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
