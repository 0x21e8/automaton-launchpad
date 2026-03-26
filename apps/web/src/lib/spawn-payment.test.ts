import { describe, expect, it, vi } from "vitest";

import {
  deriveClaimId,
  type SpawnPaymentInstructions,
  type SpawnSession
} from "@ic-automaton/shared";

import {
  connectWalletToSpawnChain,
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

function createPlaygroundMetadata() {
  return {
    environmentLabel: "Automaton Playground",
    environmentVersion: "runtime-2026.03.26+sha.abcdef",
    maintenance: false,
    chain: {
      id: 20_260_326,
      name: "Automaton Playground",
      publicRpcUrl: "https://rpc.playground.example.com",
      nativeCurrency: {
        name: "Ether",
        symbol: "ETH",
        decimals: 18
      },
      explorerUrl: "https://otter.playground.example.com"
    },
    faucet: {
      available: true,
      claimLimits: {
        windowSeconds: 86_400,
        maxClaimsPerWallet: 1,
        maxClaimsPerIp: 1
      },
      claimAssetAmounts: [
        {
          asset: "eth" as const,
          amount: "1",
          decimals: 18
        },
        {
          asset: "usdc" as const,
          amount: "250",
          decimals: 6
        }
      ]
    },
    reset: {
      lastResetAt: null,
      nextResetAt: null,
      cadenceLabel: "Daily hard reset"
    }
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
      null,
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

  it("adds and switches to the runtime playground chain when the wallet does not know it yet", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce({
        code: 4902,
        message: "Unknown chain."
      })
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
      createPlaygroundMetadata(),
      {
        VITE_SPAWN_USDC_CONTRACT_ADDRESS:
          "0x3333333333333333333333333333333333333333"
      }
    );

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13525e6" }]
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x13525e6",
          chainName: "Automaton Playground",
          rpcUrls: ["https://rpc.playground.example.com"],
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18
          },
          blockExplorerUrls: ["https://otter.playground.example.com"]
        }
      ]
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13525e6" }]
    });
    expect(request).toHaveBeenNthCalledWith(4, {
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
    expect(request).toHaveBeenNthCalledWith(5, {
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

  it("uses the configured fallback chain id when runtime metadata is unavailable", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce({
        code: 4902,
        message: "Unknown chain."
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await connectWalletToSpawnChain(
      "base",
      { request },
      null,
      {
        VITE_SPAWN_CHAIN_ID: "20260326",
        VITE_SPAWN_CHAIN_NAME: "Automaton Playground",
        VITE_SPAWN_CHAIN_RPC_URL: "https://rpc.playground.example.com"
      }
    );

    expect(request).toHaveBeenNthCalledWith(1, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13525e6" }]
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: "0x13525e6",
          chainName: "Automaton Playground",
          rpcUrls: ["https://rpc.playground.example.com"],
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
            decimals: 18
          },
          blockExplorerUrls: ["https://basescan.org"]
        }
      ]
    });
    expect(request).toHaveBeenNthCalledWith(3, {
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13525e6" }]
    });
  });

  it("disables the wallet action on the wrong chain or after partial payment", () => {
    const session = createSession();
    const payment = createPayment();

    expect(
      getSpawnPaymentAvailability(session, payment, {
        address: "0xabc",
        chainId: 1
      }, createPlaygroundMetadata()).disabledReason
    ).toContain("20260326");

    expect(
      getSpawnPaymentAvailability(
        createSession({
          paymentStatus: "partial"
        }),
        payment,
        {
          address: "0xabc",
          chainId: 8453
        },
        createPlaygroundMetadata()
      ).disabledReason
    ).toContain("Partial payments");
  });

  it("formats wallet rejections and encoding failures for the wizard", async () => {
    const rejected = formatSpawnPaymentError({
      code: 4001,
      message: "User rejected the request."
    });

    expect(rejected).toBe("Wallet rejected the payment transaction.");
    expect(
      formatSpawnPaymentError(
        new Error("insufficient funds for gas * price + value")
      )
    ).toBe("Connected wallet does not have enough ETH to cover playground gas.");

    await expect(
      executeSpawnPayment(
        createPayment({
          claimId: "0x1234"
        }),
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        { request: vi.fn() },
        null,
        {
          VITE_SPAWN_USDC_CONTRACT_ADDRESS:
            "0x3333333333333333333333333333333333333333"
        }
      )
    ).rejects.toThrow("Unable to encode the escrow deposit transaction.");
  });
});
