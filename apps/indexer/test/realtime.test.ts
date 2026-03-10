import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@ic-automaton/shared";

import { buildServer } from "../src/server.js";
import type {
  AutomatonClient,
  IdentityConfigRead,
  RecentTurnsRead,
  RuntimeFinancialRead
} from "../src/integrations/automaton-client.js";
import { AutomatonIndexer } from "../src/polling/automaton-indexer.js";
import { createSqliteStore } from "../src/store/sqlite.js";
import { RealtimeHub, shouldDeliverEvent } from "../src/ws/events.js";
import {
  createAutomatonRecordFixture,
  createSpawnSessionDetailFixture
} from "./fixtures.js";

const require = createRequire(import.meta.url);
const WebSocketClient = require("ws").WebSocket as new (url: string) => TestWebSocket;
const tempPaths: string[] = [];

interface TestWebSocket {
  addEventListener(
    event: "error" | "message" | "open",
    listener: (event: { data?: unknown }) => void,
    options?: { once?: boolean }
  ): void;
  close(): void;
  removeEventListener(
    event: "error" | "message" | "open",
    listener: (event: { data?: unknown }) => void
  ): void;
}

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function createDatabasePath() {
  const directory = await mkdtemp(join(tmpdir(), "indexer-realtime-"));
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
    promptLayers: [],
    skills: [],
    strategies: []
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

async function openWebSocket(url: string) {
  const socket = new WebSocketClient(url);

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out opening websocket ${url}`));
    }, 5_000);
    const onOpen = () => {
      clearTimeout(timeout);
      socket.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      clearTimeout(timeout);
      socket.removeEventListener("open", onOpen);
      reject(new Error(`Failed to open websocket ${url}`));
    };

    socket.addEventListener("open", onOpen, { once: true });
    socket.addEventListener("error", onError, { once: true });
  });

  return socket;
}

function waitForWebSocketMessage(socket: TestWebSocket, timeoutMs = 5_000) {
  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message."));
    }, timeoutMs);
    const onMessage = (event: { data?: unknown }) => {
      cleanup();
      resolve(String(event.data));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Websocket error while waiting for message."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

function expectNoWebSocketMessage(socket: TestWebSocket, timeoutMs = 300) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const onMessage = (event: { data?: unknown }) => {
      cleanup();
      reject(new Error(`Unexpected websocket message: ${String(event.data)}`));
    };
    const onError = () => {
      cleanup();
      reject(new Error("Websocket error while waiting for silence."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("error", onError);
    };

    socket.addEventListener("message", onMessage);
    socket.addEventListener("error", onError);
  });
}

describe("realtime hub", () => {
  it("exposes the websocket path and supported event types", () => {
    const hub = new RealtimeHub("/ws/events");

    expect(hub.getSnapshot()).toMatchObject({
      websocketPath: "/ws/events",
      clientCount: 0
    });
    expect(hub.getSnapshot().supportedEventTypes).toContain("spawn");
    expect(hub.getSnapshot().supportedEventTypes).toContain("spawn.session.failed");
  });

  it("filters automaton-scoped events by canister id", () => {
    const automaton = createAutomatonRecordFixture();
    const matchingEvent: RealtimeEvent = {
      type: "spawn",
      automaton
    };
    const nonMatchingEvent: RealtimeEvent = {
      type: "offline",
      canisterId: "bbbbb-bb",
      timestamp: Date.now()
    };

    expect(shouldDeliverEvent(automaton.canisterId, matchingEvent)).toBe(true);
    expect(shouldDeliverEvent(automaton.canisterId, nonMatchingEvent)).toBe(false);
    expect(shouldDeliverEvent(undefined, nonMatchingEvent)).toBe(true);
  });

  it("filters session-scoped events by session id", () => {
    const detail = createSpawnSessionDetailFixture();
    const matchingEvent: RealtimeEvent = {
      type: "spawn.session.completed",
      session: detail.session,
      audit: detail.audit
    };
    const nonMatchingEvent: RealtimeEvent = {
      type: "spawn.session.failed",
      session: {
        ...detail.session,
        sessionId: "session-other"
      },
      audit: detail.audit
    };

    expect(
      shouldDeliverEvent(
        {
          sessionId: detail.session.sessionId
        },
        matchingEvent
      )
    ).toBe(true);
    expect(
      shouldDeliverEvent(
        {
          sessionId: detail.session.sessionId
        },
        nonMatchingEvent
      )
    ).toBe(false);
  });

  it("streams live update events over a real websocket and honors canister filters", async () => {
    const canisterId = "txyno-ch777-77776-aaaaq-cai";
    const databasePath = await createDatabasePath();
    const store = createSqliteStore({
      databasePath
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
        port: 0,
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
      }
    });
    const app = buildServer({
      store,
      automatonIndexer: indexer,
      automatonClient: client,
      config: {
        host: "127.0.0.1",
        port: 0,
        databasePath,
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

    await app.listen({
      host: "127.0.0.1",
      port: 0
    });

    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address for websocket test.");
    }

    const matchingSocket = await openWebSocket(
      `ws://127.0.0.1:${address.port}/ws/events?canisterId=${canisterId}`
    );
    const nonMatchingSocket = await openWebSocket(
      `ws://127.0.0.1:${address.port}/ws/events?canisterId=ryjl3-tyaaa-aaaaa-aaaba-cai`
    );
    const eventMessage = waitForWebSocketMessage(matchingSocket);
    const noMessage = expectNoWebSocketMessage(nonMatchingSocket);

    await app.indexerStore.syncConfiguredCanisterIds([canisterId]);
    await app.automatonIndexer.refreshPriceNow();
    await app.automatonIndexer.pollIdentityNow();

    await expect(eventMessage.then((payload) => JSON.parse(payload))).resolves.toMatchObject({
      type: "update",
      canisterId
    });
    await expect(noMessage).resolves.toBeUndefined();

    matchingSocket.close();
    nonMatchingSocket.close();
    await app.close();
  });
});
