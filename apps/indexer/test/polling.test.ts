import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "../src/server.js";
import type {
  AutomatonClient,
  IdentityConfigRead,
  RecentTurnsRead,
  RuntimeFinancialRead
} from "../src/integrations/automaton-client.js";
import {
  AutomatonIndexer,
  FixedEthUsdPriceSource,
  type RealtimeEventPublisher
} from "../src/polling/automaton-indexer.js";
import { createSqliteStore } from "../src/store/sqlite.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function createDatabasePath() {
  const directory = await mkdtemp(join(tmpdir(), "indexer-polling-"));
  tempPaths.push(directory);
  return join(directory, "indexer.sqlite");
}

function createIdentityConfigRead(canisterId: string): IdentityConfigRead {
  return {
    canisterId,
    buildInfo: {
      commit: "0123456789abcdef"
    },
    evmConfig: {
      automaton_address: "0x1111111111111111111111111111111111111111",
      chain_id: 8453,
      inbox_contract_address: "0x2222222222222222222222222222222222222222"
    },
    stewardStatus: {
      active_steward: {
        address: "0x3333333333333333333333333333333333333333",
        chain_id: 8453,
        enabled: true
      },
      next_nonce: 7
    },
    schedulerConfig: {
      base_tick_secs: 30,
      default_turn_interval_secs: 150,
      ticks_per_turn_interval: 5
    },
    promptLayers: [
      {
        layer_id: 6,
        is_mutable: true,
        content: "Protect the canister first.",
        updated_at_ns: [1_709_912_345_000_000_000n],
        updated_by_turn: ["turn-0"],
        version: [1]
      }
    ],
    skills: [
      {
        name: "Messaging",
        description: "Exchange packets with sibling automatons.",
        instructions: "Use the inbox carefully.",
        enabled: true,
        mutable: true,
        allowed_canister_calls: []
      }
    ],
    strategies: [
      {
        key: {
          protocol: "Aerodrome",
          primitive: "yield-farming",
          chain_id: 8453n,
          template_id: "velo-usdc"
        },
        status: {
          Active: null
        },
        contract_roles: [],
        actions: [],
        constraints_json: "{}",
        created_at_ns: 1_709_912_345_000_000_000n,
        updated_at_ns: 1_709_912_346_000_000_000n
      }
    ]
  };
}

function createRuntimeFinancialRead(canisterId: string): RuntimeFinancialRead {
  return {
    canisterId,
    snapshot: {
      runtime: {
        soul: "Yield allocator focused on preserving runway.",
        state: "Idle",
        loop_enabled: true,
        last_error: null,
        last_transition_at_ns: 1_709_912_347_000_000_000
      },
      scheduler: {
        enabled: true,
        last_tick_error: null,
        survival_tier: "LowCycles"
      },
      cycles: {
        total_cycles: 4_200_000_000_000,
        liquid_cycles: 3_100_000_000_000,
        burn_rate_cycles_per_day: 182_000_000_000,
        estimated_freeze_time_ns: 1_710_112_347_000_000_000
      },
      recent_turns: [
        {
          id: "turn-2",
          created_at_ns: 1_709_912_349_000_000_000,
          duration_ms: 1_240,
          state_from: "Idle",
          state_to: "ExecutingActions",
          tool_call_count: 2,
          input_summary: "Rebalance pool positions",
          inner_dialogue: "Rebalancing exposure toward the active LP.",
          error: null
        },
        {
          id: "turn-1",
          created_at_ns: 1_709_912_348_000_000_000,
          duration_ms: 830,
          state_from: "Sleeping",
          state_to: "Idle",
          tool_call_count: 0,
          input_summary: "Wake and inspect balances",
          inner_dialogue: "Checking solvency before the next action.",
          error: null
        }
      ]
    },
    walletBalance: {
      eth_balance_wei_hex: "0x1999999999999a00",
      usdc_balance_raw_hex: "0x2540be400",
      usdc_decimals: 6,
      last_error: null,
      last_synced_at_ns: 1_709_912_350_000_000_000,
      status: "ok",
      is_stale: false
    }
  };
}

function createRecentTurnsRead(canisterId: string): RecentTurnsRead {
  return {
    canisterId,
    recentTurns: createRuntimeFinancialRead(canisterId).snapshot.recent_turns ?? []
  };
}

describe("automaton indexer poller", () => {
  it("normalizes live reads into sqlite and keeps monologue upserts idempotent", async () => {
    const canisterId = "txyno-ch777-77776-aaaaq-cai";
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });
    const client: AutomatonClient = {
      readIdentityConfig: vi.fn(async () => createIdentityConfigRead(canisterId)),
      readRuntimeFinancial: vi.fn(async () => createRuntimeFinancialRead(canisterId)),
      readRecentTurns: vi.fn(async () => createRecentTurnsRead(canisterId))
    };
    const indexer = new AutomatonIndexer({
      client,
      store,
      config: {
        host: "127.0.0.1",
        port: 3001,
        databasePath: "",
        websocketPath: "/ws/events",
        corsAllowedOrigins: [],
        ingestion: {
          canisterIds: [canisterId],
          network: {
            target: "local",
            local: {
              host: "localhost",
              port: 8000
            }
          }
        },
        factoryCanisterId: undefined,
        icHost: "http://localhost:8000",
        fastPollIntervalMs: 15_000,
        slowPollIntervalMs: 300_000,
        pricePollIntervalMs: 60_000
      },
      priceSource: new FixedEthUsdPriceSource(2_500)
    });

    await store.initialize();
    await store.syncConfiguredCanisterIds([canisterId]);

    await indexer.refreshPriceNow();
    await indexer.pollIdentityNow();
    await indexer.pollRuntimeNow();
    await indexer.pollMonologueNow();
    await indexer.pollMonologueNow();

    await expect(store.listAutomatons()).resolves.toMatchObject({
      total: 1,
      prices: {
        ethUsd: 2_500
      }
    });

    await expect(store.getAutomatonDetail(canisterId)).resolves.toMatchObject({
      canisterId,
      chain: "base",
      tier: "low",
      name: expect.stringMatching(/^[A-Z]+-\d{2}$/),
      canisterUrl: "http://txyno-ch777-77776-aaaaq-cai.localhost:8000",
      explorerUrl: "https://basescan.org/address/0x1111111111111111111111111111111111111111",
      runtime: {
        agentState: "Idle",
        loopEnabled: true,
        heartbeatIntervalSeconds: 150
      },
      financials: {
        cyclesBalance: 4_200_000_000_000,
        liquidCycles: 3_100_000_000_000
      },
      strategies: [
        {
          key: {
            protocol: "Aerodrome",
            primitive: "yield-farming",
            templateId: "velo-usdc",
            chainId: 8453
          },
          status: "active"
        }
      ],
      skills: [
        {
          name: "Messaging",
          enabled: true
        }
      ],
      promptLayers: ["Protect the canister first."],
      monologue: [
        {
          turnId: "turn-2"
        },
        {
          turnId: "turn-1"
        }
      ]
    });

    await expect(
      store.listMonologue(canisterId, {
        limit: 50
      })
    ).resolves.toMatchObject({
      entries: [
        {
          turnId: "turn-2"
        },
        {
          turnId: "turn-1"
        }
      ],
      hasMore: false
    });

    expect(indexer.getSnapshot()).toMatchObject({
      enabled: false,
      price: {
        ethUsd: 2_500,
        source: "fixed",
        label: "fixed:2500"
      },
      canisters: {
        [canisterId]: {
          currentDetailAvailable: true,
          lastIndexedMonologueCount: 2,
          lastObservedTurnId: "turn-2",
          identity: {
            successCount: 1,
            lastError: null
          },
          runtime: {
            successCount: 1,
            lastError: null
          },
          monologue: {
            successCount: 2,
            lastError: null
          }
        }
      }
    });

    await store.close();
  });

  it("surfaces live polling debug state in /health", async () => {
    const canisterId = "txyno-ch777-77776-aaaaq-cai";
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });
    const client: AutomatonClient = {
      readIdentityConfig: async () => createIdentityConfigRead(canisterId),
      readRuntimeFinancial: async () => createRuntimeFinancialRead(canisterId),
      readRecentTurns: async () => createRecentTurnsRead(canisterId)
    };
    const indexer = new AutomatonIndexer({
      client,
      store,
      config: {
        host: "127.0.0.1",
        port: 3001,
        databasePath: "",
        websocketPath: "/ws/events",
        corsAllowedOrigins: [],
        ingestion: {
          canisterIds: [canisterId],
          network: {
            target: "local",
            local: {
              host: "localhost",
              port: 8000
            }
          }
        },
        factoryCanisterId: undefined,
        icHost: "http://localhost:8000",
        fastPollIntervalMs: 15_000,
        slowPollIntervalMs: 300_000,
        pricePollIntervalMs: 60_000
      },
      priceSource: new FixedEthUsdPriceSource(2_500)
    });

    await store.initialize();
    await store.syncConfiguredCanisterIds([canisterId]);
    await indexer.refreshPriceNow();
    await indexer.pollIdentityNow();

    const app = buildServer({
      store,
      automatonIndexer: indexer,
      config: {
        databasePath: "",
        ingestion: {
          canisterIds: [canisterId],
          network: {
            target: "local",
            local: {
              host: "localhost",
              port: 8000
            }
          }
        }
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      discovery: {
        seedCanisterIds: [canisterId]
      },
      polling: {
        live: {
          price: {
            ethUsd: 2_500,
            label: "fixed:2500"
          },
          canisters: {
            [canisterId]: {
              currentDetailAvailable: true,
              identity: {
                successCount: 1,
                lastError: null
              }
            }
          }
        }
      }
    });

    await app.close();
  });

  it("emits update and monologue events only when live reads change", async () => {
    const canisterId = "txyno-ch777-77776-aaaaq-cai";
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });
    const publisher: RealtimeEventPublisher = {
      broadcast: vi.fn()
    };
    const client: AutomatonClient = {
      readIdentityConfig: vi.fn(async () => createIdentityConfigRead(canisterId)),
      readRuntimeFinancial: vi.fn(async () => createRuntimeFinancialRead(canisterId)),
      readRecentTurns: vi.fn(async () => createRecentTurnsRead(canisterId))
    };
    const indexer = new AutomatonIndexer({
      client,
      store,
      eventPublisher: publisher,
      config: {
        host: "127.0.0.1",
        port: 3001,
        databasePath: "",
        websocketPath: "/ws/events",
        corsAllowedOrigins: [],
        ingestion: {
          canisterIds: [canisterId],
          network: {
            target: "local",
            local: {
              host: "localhost",
              port: 8000
            }
          }
        },
        factoryCanisterId: undefined,
        icHost: "http://localhost:8000",
        fastPollIntervalMs: 15_000,
        slowPollIntervalMs: 300_000,
        pricePollIntervalMs: 60_000
      },
      priceSource: new FixedEthUsdPriceSource(2_500)
    });

    await store.initialize();
    await store.syncConfiguredCanisterIds([canisterId]);

    await indexer.refreshPriceNow();
    await indexer.pollIdentityNow();
    await indexer.pollRuntimeNow();
    await indexer.pollMonologueNow();
    await indexer.pollIdentityNow();
    await indexer.pollRuntimeNow();
    await indexer.pollMonologueNow();

    expect(publisher.broadcast).toHaveBeenCalledTimes(4);
    expect(publisher.broadcast).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: "update",
        canisterId,
        changes: expect.objectContaining({
          canisterId,
          promptLayers: ["Protect the canister first."]
        })
      })
    );
    expect(publisher.broadcast).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: "update",
        canisterId,
        changes: expect.objectContaining({
          agentState: "Idle",
          cyclesBalance: 4_200_000_000_000,
          netWorthUsd: 14_611.69,
          tier: "low"
        })
      })
    );
    expect(publisher.broadcast).toHaveBeenNthCalledWith(3, {
      type: "monologue",
      canisterId,
      entry: expect.objectContaining({
        turnId: "turn-1"
      })
    });
    expect(publisher.broadcast).toHaveBeenNthCalledWith(4, {
      type: "monologue",
      canisterId,
      entry: expect.objectContaining({
        turnId: "turn-2"
      })
    });

    await store.close();
  });
});
