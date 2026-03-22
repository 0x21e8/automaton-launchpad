import { describe, expect, it } from "vitest";

import {
  AUTOMATON_TIERS,
  MONOLOGUE_ENTRY_CATEGORIES,
  MONOLOGUE_ENTRY_IMPORTANCE,
  MONOLOGUE_ENTRY_TYPES,
  type AutomatonListResponse
} from "../src/automaton.ts";
import { CATALOG_ENTRY_STATUSES } from "../src/catalog.ts";
import {
  AUTOMATON_EVENT_TYPES,
  SPAWN_EVENT_TYPES,
  type RealtimeEvent
} from "../src/events.ts";
import {
  deriveClaimId,
  MINIMUM_GROSS_PAYMENT_USD,
  PAYMENT_STATUSES,
  SESSION_AUDIT_ACTORS,
  SPAWN_SESSION_STATES,
  SUPPORTED_SPAWN_ASSETS,
  type SpawnSessionDetail,
  type SpawnSessionStatusResponse
} from "../src/spawn.ts";

describe("shared contracts", () => {
  it("tracks the locked spawn session lifecycle", () => {
    expect(SPAWN_SESSION_STATES).toEqual([
      "awaiting_payment",
      "payment_detected",
      "spawning",
      "broadcasting_release",
      "complete",
      "failed",
      "expired"
    ]);
  });

  it("keeps the minimum gross payment floor at fifty dollars", () => {
    expect(MINIMUM_GROSS_PAYMENT_USD).toBe(50);
    expect(SUPPORTED_SPAWN_ASSETS).toEqual(["usdc"]);
    expect(PAYMENT_STATUSES).toEqual(["unpaid", "partial", "paid", "refunded"]);
  });

  it("exposes stable automaton, audit, and catalog enums", () => {
    expect(AUTOMATON_TIERS).toEqual([
      "normal",
      "low",
      "critical",
      "out_of_cycles"
    ]);
    expect(MONOLOGUE_ENTRY_TYPES).toEqual(["thought", "action"]);
    expect(MONOLOGUE_ENTRY_CATEGORIES).toEqual([
      "observe",
      "decide",
      "act",
      "message",
      "error"
    ]);
    expect(MONOLOGUE_ENTRY_IMPORTANCE).toEqual([
      "low",
      "medium",
      "high"
    ]);
    expect(SESSION_AUDIT_ACTORS).toEqual(["system", "user", "admin"]);
    expect(CATALOG_ENTRY_STATUSES).toEqual(["available", "coming_soon"]);
  });

  it("defines the locked realtime event names", () => {
    expect(AUTOMATON_EVENT_TYPES).toEqual([
      "spawn",
      "update",
      "action",
      "message",
      "monologue",
      "offline"
    ]);
    expect(SPAWN_EVENT_TYPES).toEqual([
      "spawn.session.updated",
      "spawn.session.completed",
      "spawn.session.failed",
      "spawn.session.expired"
    ]);
  });

  it("keeps the shared API shapes compilable for later milestones", () => {
    const sessionId = "550e8400-e29b-41d4-a716-446655440000";
    const claimId = "0x2f779c94a35dceba72fe536ce28c5fea7566753044cdf9da29f6402ea964b7f9";
    const status: SpawnSessionStatusResponse = {
      session: {
        sessionId,
        claimId,
        stewardAddress: "0xabc",
        chain: "base",
        asset: "usdc",
        grossAmount: "1000000000",
        platformFee: "1000000",
        creationCost: "2000000",
        netForwardAmount: "997000000",
        quoteTermsHash: "0xdeadbeef",
        expiresAt: 1_710_000_000_000,
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
          strategies: ["yield-farming"],
          skills: ["portfolio-reporting"],
          provider: {
            openRouterApiKey: null,
            model: null,
            braveSearchApiKey: null
          }
        },
        createdAt: 1_710_000_000_000,
        updatedAt: 1_710_000_000_000
      },
      payment: {
        sessionId,
        claimId,
        quoteTermsHash: "0xdeadbeef",
        paymentAddress: "0xfeed",
        chain: "base",
        asset: "usdc",
        grossAmount: "1000000000",
        expiresAt: 1_710_000_000_000
      },
      audit: [
        {
          sessionId,
          timestamp: 1_710_000_000_000,
          fromState: null,
          toState: "awaiting_payment",
          actor: "system",
          reason: "created"
        }
      ]
    };
    const detail: SpawnSessionDetail = {
      ...status,
      registryRecord: {
        canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        stewardAddress: "0xabc",
        evmAddress: "0x1234",
        chain: "base",
        sessionId,
        parentId: null,
        childIds: [],
        createdAt: 1_710_000_000_010,
        versionCommit: "abcdef1234567890abcdef1234567890abcdef12"
      }
    };

    const listResponse: AutomatonListResponse = {
      automatons: [
        {
          canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
          ethAddress: "0x1234",
          chain: "base",
          chainId: 8453,
          name: "ALPHA-42",
          tier: "normal",
          agentState: "Idle",
          ethBalanceWei: "0x1",
          usdcBalanceRaw: "0x0",
          cyclesBalance: 42,
          netWorthEth: "0.1",
          netWorthUsd: "240.00",
          heartbeatIntervalSeconds: 30,
          steward: {
            address: "0xabc",
            chainId: 8453,
            ensName: null,
            enabled: true
          },
          gridPosition: { x: 4, y: 2 },
          corePatternIndex: 3,
          corePattern: null,
          parentId: null,
          createdAt: 1_710_000_000_000,
          lastTransitionAt: 1_710_000_000_000
        }
      ],
      total: 1,
      prices: {
        ethUsd: 2400.5
      }
    };

    const event: RealtimeEvent = {
      type: "update",
      canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
      changes: {
        tier: "low"
      },
      timestamp: 1_710_000_000_000
    };

    expect(status.audit).toHaveLength(1);
    expect(deriveClaimId(sessionId)).toBe(claimId);
    expect(detail.payment.paymentAddress).toBe("0xfeed");
    expect(listResponse.automatons[0]?.name).toBe("ALPHA-42");
    expect(event.type).toBe("update");
  });
});
