import { describe, expect, it } from "vitest";

import type { SpawnQuote, SpawnSession, SpawnSessionDetail } from "@ic-automaton/shared";

import {
  derivePaymentInstructions,
  describeSpawnSessionProgress,
  formatSpawnSessionStateLabel
} from "./useSpawnSession";

function createSession(overrides: Partial<SpawnSession> = {}): SpawnSession {
  return {
    sessionId: "session-1",
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
    parentId: null,
    childIds: [],
    config: {
      chain: "base",
      risk: 3,
      strategies: [],
      skills: [],
      openRouterApiKey: null,
      model: null,
      braveSearchApiKey: null
    },
    createdAt: 1_709_912_345_000,
    updatedAt: 1_709_912_345_000,
    ...overrides
  };
}

describe("useSpawnSession helpers", () => {
  it("describes retry and refund-eligible session states", () => {
    expect(
      describeSpawnSessionProgress(
        createSession({
          state: "failed",
          retryable: true,
          paymentStatus: "paid"
        })
      )
    ).toContain("retried");
    expect(
      describeSpawnSessionProgress(
        createSession({
          state: "expired",
          refundable: true,
          paymentStatus: "partial"
        })
      )
    ).toContain("Funds can now be reclaimed");
    expect(formatSpawnSessionStateLabel("payment_detected")).toBe("Payment Detected");
  });

  it("prefers escrow payment instructions and falls back to the quote", () => {
    const session = createSession();
    const quote: SpawnQuote = {
      sessionId: session.sessionId,
      chain: session.chain,
      asset: session.asset,
      grossAmount: session.grossAmount,
      platformFee: session.platformFee,
      creationCost: session.creationCost,
      netForwardAmount: session.netForwardAmount,
      quoteTermsHash: session.quoteTermsHash,
      expiresAt: session.expiresAt,
      payment: {
        sessionId: session.sessionId,
        chain: session.chain,
        asset: session.asset,
        paymentAddress: "0xquote",
        grossAmount: session.grossAmount,
        quoteTermsHash: session.quoteTermsHash,
        expiresAt: session.expiresAt
      }
    };
    const detail: SpawnSessionDetail = {
      session,
      audit: [],
      escrow: {
        sessionId: session.sessionId,
        quoteTermsHash: session.quoteTermsHash,
        paymentAddress: "0xescrow",
        chain: session.chain,
        asset: session.asset,
        requiredGrossAmount: session.grossAmount,
        paidAmount: "0",
        paymentStatus: "unpaid",
        refundable: false,
        refundedAt: null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      },
      registryRecord: null
    };

    expect(derivePaymentInstructions(session, detail, quote)).toMatchObject({
      paymentAddress: "0xescrow"
    });
    expect(derivePaymentInstructions(session, null, quote)).toMatchObject({
      paymentAddress: "0xquote"
    });
  });
});
