import { describe, expect, it, vi } from "vitest";

import {
  deriveClaimId,
  type SpawnPaymentInstructions,
  type SpawnSession
} from "@ic-automaton/shared";

import {
  executeSpawnPayment,
  formatSpawnPaymentError,
  getSpawnPaymentAvailability
} from "./spawn-payment";

function createSession(overrides: Partial<SpawnSession> = {}): SpawnSession {
  const sessionId = overrides.sessionId ?? "session-1";

  return {
    sessionId,
    claimId: deriveClaimId(sessionId),
    stewardAddress: "0xabc",
    chain: "base",
    asset: "usdc",
    grossAmount: "100",
    platformFee: "4.5",
    creationCost: "8",
    netForwardAmount: "87.5",
    quoteTermsHash: "0xdeadbeef",
    expiresAt: 1_709_912_400_000,
    state: "awaiting_payment",
    retryable: false,
    refundable: false,
    paymentStatus: "unpaid",
    automatonCanisterId: null,
    automatonEvmAddress: null,
    releaseTxHash: null,
    releaseBroadcastAt: null,
    parentId: null,
    childIds: [],
    config: {
      chain: "base",
      risk: 3,
      strategies: [],
      skills: [],
      provider: {
        openRouterApiKey: null,
        model: null,
        braveSearchApiKey: null
      }
    },
    createdAt: 1_709_912_345_000,
    updatedAt: 1_709_912_345_000,
    ...overrides
  };
}

function createPayment(
  overrides: Partial<SpawnPaymentInstructions> = {}
): SpawnPaymentInstructions {
  const session = createSession();

  return {
    sessionId: session.sessionId,
    claimId: session.claimId,
    chain: "base",
    asset: "usdc",
    paymentAddress: "0x1111111111111111111111111111111111111111",
    grossAmount: "100",
    quoteTermsHash: session.quoteTermsHash,
    expiresAt: session.expiresAt,
    ...overrides
  };
}

describe("spawn payment executor", () => {
  it("submits approval and deposit transactions using session instructions", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("0xapprove")
      .mockResolvedValueOnce("0xdeposit");

    const payment = createPayment({
      grossAmount: "75.25",
      paymentAddress: "0x2222222222222222222222222222222222222222"
    });

    const result = await executeSpawnPayment(
      payment,
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      { request },
      {
        VITE_SPAWN_USDC_CONTRACT_ADDRESS:
          "0x3333333333333333333333333333333333333333"
      }
    );

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }]
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          to: "0x3333333333333333333333333333333333333333",
          data:
            "0x095ea7b3000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000047c3950",
          value: "0x0"
        }
      ]
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          to: "0x2222222222222222222222222222222222222222",
          data: `0x1de26e16${payment.claimId.slice(2)}00000000000000000000000000000000000000000000000000000000047c3950`,
          value: "0x0"
        }
      ]
    });
    expect(result).toEqual({
      approvalTxHash: "0xapprove",
      paymentTxHash: "0xdeposit"
    });
  });

  it("adds the configured local chain when the wallet does not know chain 8453 yet", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("0xapprove")
      .mockResolvedValueOnce("0xdeposit");

    const payment = createPayment({
      grossAmount: "75.25",
      paymentAddress: "0x2222222222222222222222222222222222222222"
    });

    const result = await executeSpawnPayment(
      payment,
      "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      { request },
      {
        VITE_SPAWN_CHAIN_NAME: "Base Local Fork",
        VITE_SPAWN_CHAIN_RPC_URL: "http://127.0.0.1:18545",
        VITE_SPAWN_CHAIN_BLOCK_EXPLORER_URL: "",
        VITE_SPAWN_USDC_CONTRACT_ADDRESS:
          "0x3333333333333333333333333333333333333333"
      }
    );

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x2105",
          chainName: "Base Local Fork",
          rpcUrls: ["http://127.0.0.1:18545"],
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18
          },
          blockExplorerUrls: ["https://basescan.org"]
        }
      ]
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }]
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          to: "0x3333333333333333333333333333333333333333",
          data:
            "0x095ea7b3000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000047c3950",
          value: "0x0"
        }
      ]
    });
    expect(request).toHaveBeenNthCalledWith(4, {
      method: "eth_sendTransaction",
      params: [
        {
          from: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          to: "0x2222222222222222222222222222222222222222",
          data: `0x1de26e16${payment.claimId.slice(2)}00000000000000000000000000000000000000000000000000000000047c3950`,
          value: "0x0"
        }
      ]
    });
    expect(result).toEqual({
      approvalTxHash: "0xapprove",
      paymentTxHash: "0xdeposit"
    });
  });

  it("disables the wallet action on the wrong chain or after partial payment", () => {
    const session = createSession();
    const payment = createPayment();

    expect(
      getSpawnPaymentAvailability(session, payment, {
        address: "0xabc",
        chainId: 1
      }).disabledReason
    ).toContain("8453");

    expect(
      getSpawnPaymentAvailability(
        createSession({
          paymentStatus: "partial"
        }),
        payment,
        {
          address: "0xabc",
          chainId: 8453
        }
      ).disabledReason
    ).toContain("Partial payments");
  });

  it("formats wallet rejections and encoding failures for the wizard", async () => {
    const rejected = formatSpawnPaymentError({
      code: 4001,
      message: "User rejected the request."
    });

    expect(rejected).toBe("Wallet rejected the payment transaction.");

    await expect(
      executeSpawnPayment(
        createPayment({
          claimId: "0x1234"
        }),
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        { request: vi.fn() },
        {
          VITE_SPAWN_USDC_CONTRACT_ADDRESS:
            "0x3333333333333333333333333333333333333333"
        }
      )
    ).rejects.toThrow("Unable to encode the escrow deposit transaction.");
  });
});
