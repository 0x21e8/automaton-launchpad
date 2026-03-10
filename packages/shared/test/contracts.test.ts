import { describe, expect, it } from "vitest";

import {
  AUTOMATON_TIERS,
  MONOLOGUE_ENTRY_TYPES,
  type AutomatonListResponse
} from "../src/automaton.js";
import { CATALOG_ENTRY_STATUSES } from "../src/catalog.js";
import {
  AUTOMATON_EVENT_TYPES,
  SPAWN_EVENT_TYPES,
  type RealtimeEvent
} from "../src/events.js";
import {
  type EscrowPaymentRecord,
  MINIMUM_GROSS_PAYMENT_USD,
  PAYMENT_STATUSES,
  SESSION_AUDIT_ACTORS,
  SPAWN_SESSION_STATES,
  SUPPORTED_SPAWN_ASSETS,
  type SpawnSessionDetail,
  type SpawnSessionStatusResponse
} from "../src/spawn.js";

describe("shared contracts", () => {
  it("tracks the locked spawn session lifecycle", () => {
    expect(SPAWN_SESSION_STATES).toEqual([
      "awaiting_payment",
      "payment_detected",
      "spawning",
      "funding_automaton",
      "complete",
      "failed",
      "expired"
    ]);
  });

  it("keeps the minimum gross payment floor at fifty dollars", () => {
    expect(MINIMUM_GROSS_PAYMENT_USD).toBe(50);
    expect(SUPPORTED_SPAWN_ASSETS).toEqual(["eth", "usdc"]);
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
    expect(SESSION_AUDIT_ACTORS).toEqual([
      "system",
      "user",
      "admin",
      "escrow"
    ]);
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
    const status: SpawnSessionStatusResponse = {
      session: {
        sessionId: "sess_123",
        stewardAddress: "0xabc",
        chain: "base",
        asset: "eth",
        grossAmount: "1000000000000000000",
        platformFee: "10000000000000000",
        creationCost: "20000000000000000",
        netForwardAmount: "970000000000000000",
        quoteTermsHash: "0xdeadbeef",
        expiresAt: 1_710_000_000_000,
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
          strategies: ["yield-farming"],
          skills: ["portfolio-reporting"],
          openRouterApiKey: null,
          model: null,
          braveSearchApiKey: null
        },
        createdAt: 1_710_000_000_000,
        updatedAt: 1_710_000_000_000
      },
      audit: [
        {
          sessionId: "sess_123",
          timestamp: 1_710_000_000_000,
          fromState: null,
          toState: "awaiting_payment",
          actor: "system",
          reason: "created"
        }
      ]
    };
    const escrow: EscrowPaymentRecord = {
      sessionId: "sess_123",
      quoteTermsHash: "0xdeadbeef",
      paymentAddress: "0xfeed",
      chain: "base",
      asset: "eth",
      requiredGrossAmount: "1000000000000000000",
      paidAmount: "1000000000000000000",
      paymentStatus: "paid",
      refundable: false,
      refundedAt: null,
      createdAt: 1_710_000_000_000,
      updatedAt: 1_710_000_000_001
    };
    const detail: SpawnSessionDetail = {
      ...status,
      escrow,
      registryRecord: {
        canisterId: "rdmx6-jaaaa-aaaaa-aaadq-cai",
        stewardAddress: "0xabc",
        evmAddress: "0x1234",
        chain: "base",
        sessionId: "sess_123",
        parentId: null,
        childIds: [],
        createdAt: 1_710_000_000_010,
        versionCommit: "abcdef1234567890"
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
    expect(detail.escrow?.paymentStatus).toBe("paid");
    expect(listResponse.automatons[0]?.name).toBe("ALPHA-42");
    expect(event.type).toBe("update");
  });
});
