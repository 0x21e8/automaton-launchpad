import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { EscrowClient } from "../src/integrations/escrow-client.js";
import { FactoryClient } from "../src/integrations/factory-client.js";
import { buildServer, start } from "../src/server.js";
import {
  createAutomatonDetailFixture,
  createEscrowPaymentRecordFixture,
  createMonologueEntryFixture,
  createSpawnSessionDetailFixture,
  createSpawnedAutomatonRecordFixture
} from "./fixtures.js";

const tempPaths: string[] = [];
const indexerWorkspacePath = fileURLToPath(new URL("..", import.meta.url));
const serverEntryPath = fileURLToPath(new URL("../src/server.ts", import.meta.url));

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function createDatabasePath() {
  const directory = await mkdtemp(join(tmpdir(), "indexer-server-"));
  tempPaths.push(directory);
  return join(directory, "indexer.sqlite");
}

async function runStartupProcess(env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ["--import", "tsx", serverEntryPath], {
    cwd: indexerWorkspacePath,
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    stdout: string;
  }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Timed out waiting for indexer startup process to exit."));
    }, 5_000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        stderr,
        stdout
      });
    });
  });
}

function waitForMessage(socket: {
  once: (
    event: "error" | "message",
    listener: (value: Error | { toString(): string }) => void
  ) => void;
}) {
  return new Promise<string>((resolve, reject) => {
    socket.once("error", (error) => {
      reject(error);
    });
    socket.once("message", (data) => {
      resolve(data.toString());
    });
  });
}

describe("indexer server", () => {
  it("fails startup clearly when the canister list is invalid", async () => {
    const stderrChunks: string[] = [];
    const previousExitCode = process.exitCode;

    process.exitCode = undefined;

    try {
      await start({
        stderr: {
          write(chunk) {
            stderrChunks.push(String(chunk));
            return true;
          }
        },
        config: {
          ingestion: {
            canisterIds: [],
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

      expect(process.exitCode).toBe(1);
      expect(stderrChunks.join("")).toContain(
        "Indexer startup aborted: invalid ingestion target configuration."
      );
      expect(stderrChunks.join("")).toContain(
        "Indexer ingestion config must include at least one canister ID."
      );
      expect(stderrChunks.join("")).toContain("apps/indexer/src/indexer.config.ts");
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("fails startup clearly when the network target override is invalid", async () => {
    const result = await runStartupProcess({
      INDEXER_INGESTION_NETWORK_TARGET: "staging"
    });

    expect(result.code).toBe(1);
    expect(result.signal).toBe(null);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Indexer startup aborted: invalid ingestion target configuration."
    );
    expect(result.stderr).toContain("INDEXER_INGESTION_NETWORK_TARGET");
    expect(result.stderr).toContain(
      'Indexer ingestion config network.target must be one of "mainnet", "local".'
    );
  });

  it("responds to the health route", async () => {
    const app = buildServer({
      config: {
        databasePath: await createDatabasePath()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "indexer",
      database: {
        ok: true,
        driver: "better-sqlite3"
      },
      discovery: {
        seedCanisterIds: ["txyno-ch777-77776-aaaaq-cai"],
        targetNetwork: {
          target: "local",
          icHost: "http://localhost:8000",
          localReplica: {
            host: "localhost",
            port: 8000
          }
        },
        factoryCanisterId: null,
        factoryConfigured: false,
        escrowConfigured: false
      },
      realtime: {
        websocketPath: "/ws/events",
        clientCount: 0
      }
    });

    await app.close();
  });

  it("loads the configured canister id list into the startup registry", async () => {
    const app = buildServer({
      config: {
        databasePath: await createDatabasePath(),
        ingestion: {
          canisterIds: [
            "ryjl3-tyaaa-aaaaa-aaaba-cai",
            "txyno-ch777-77776-aaaaq-cai"
          ],
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

    await app.ready();

    await expect(app.indexerStore.listConfiguredCanisterIds()).resolves.toEqual([
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "txyno-ch777-77776-aaaaq-cai"
    ]);
    await expect(app.indexerStore.listAutomatons()).resolves.toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    await app.close();
  });

  it("surfaces the effective mainnet target in the health route", async () => {
    const app = buildServer({
      env: {
        ...process.env,
        INDEXER_INGESTION_NETWORK_TARGET: "mainnet"
      },
      config: {
        databasePath: await createDatabasePath()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      discovery: {
        seedCanisterIds: ["txyno-ch777-77776-aaaaq-cai"],
        targetNetwork: {
          target: "mainnet",
          icHost: "https://ic0.app",
          localReplica: null
        }
      }
    });

    await app.close();
  });

  it("serves empty automaton routes by default", async () => {
    const app = buildServer({
      config: {
        databasePath: await createDatabasePath()
      }
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/automatons"
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: "/api/automatons/aaaaa-aa"
    });
    const monologueResponse = await app.inject({
      method: "GET",
      url: "/api/automatons/aaaaa-aa/monologue"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    expect(detailResponse.statusCode).toBe(404);
    expect(detailResponse.json()).toMatchObject({
      ok: false,
      error: "Automaton not found"
    });

    expect(monologueResponse.statusCode).toBe(200);
    expect(monologueResponse.json()).toEqual({
      entries: [],
      hasMore: false,
      nextCursor: null
    });

    await app.close();
  });

  it("allows configured dev origins to call the API over CORS", async () => {
    const app = buildServer({
      config: {
        databasePath: await createDatabasePath()
      }
    });

    const preflightResponse = await app.inject({
      method: "OPTIONS",
      url: "/api/automatons",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/api/automatons",
      headers: {
        origin: "http://127.0.0.1:5173"
      }
    });

    expect(preflightResponse.statusCode).toBe(204);
    expect(preflightResponse.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:5173"
    );
    expect(preflightResponse.headers["access-control-allow-methods"]).toBe(
      "GET,POST,OPTIONS"
    );
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.headers["access-control-allow-origin"]).toBe(
      "http://127.0.0.1:5173"
    );

    await app.close();
  });

  it("rejects disallowed preflight origins", async () => {
    const app = buildServer({
      config: {
        databasePath: await createDatabasePath()
      }
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/automatons",
      headers: {
        origin: "https://evil.example"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      ok: false,
      error: "Origin not allowed"
    });

    await app.close();
  });

  it("returns upgrade guidance for HTTP clients and streams realtime events", async () => {
    const databasePath = await createDatabasePath();
    const app = buildServer({
      config: {
        databasePath
      }
    });
    const detail = createAutomatonDetailFixture();
    const entry = createMonologueEntryFixture();

    await app.ready();
    await app.indexerStore.upsertAutomaton(detail);
    await app.indexerStore.appendMonologue(detail.canisterId, [entry]);
    await app.indexerStore.setPrice("ethUsd", 2_499.25);
    const socket = await app.injectWS(`/ws/events?canisterId=${detail.canisterId}`);
    const eventMessage = waitForMessage(socket);

    const listResponse = await app.inject({
      method: "GET",
      url: `/api/automatons?steward=${encodeURIComponent(detail.steward.address)}`
    });
    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/automatons/${detail.canisterId}`
    });
    const monologueResponse = await app.inject({
      method: "GET",
      url: `/api/automatons/${detail.canisterId}/monologue?limit=10`
    });
    const websocketResponse = await app.inject({
      method: "GET",
      url: "/ws/events"
    });

    app.realtimeHub.broadcast({
      type: "offline",
      canisterId: detail.canisterId,
      timestamp: Date.now()
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      total: 1,
      prices: {
        ethUsd: 2_499.25
      }
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      canisterId: detail.canisterId,
      name: detail.name
    });

    expect(monologueResponse.statusCode).toBe(200);
    expect(monologueResponse.json()).toEqual({
      entries: [entry],
      hasMore: false,
      nextCursor: null
    });

    expect(websocketResponse.statusCode).toBe(426);
    expect(websocketResponse.json()).toMatchObject({
      ok: false,
      error: "Upgrade Required",
      realtime: {
        websocketPath: "/ws/events"
      }
    });
    await expect(eventMessage).resolves.toContain(detail.canisterId);

    socket.close();
    await app.close();
  });

  it("serves spawn-session status and registry routes without touching the public automaton list", async () => {
    const databasePath = await createDatabasePath();
    const registryRecord = createSpawnedAutomatonRecordFixture();
    const sessionDetail = createSpawnSessionDetailFixture({
      registryRecord
    });
    const createdSession = createSpawnSessionDetailFixture({
      registryRecord: null,
      escrow: null,
      session: {
        ...sessionDetail.session,
        sessionId: "session-create-1",
        state: "awaiting_payment",
        paymentStatus: "unpaid",
        automatonCanisterId: null,
        automatonEvmAddress: null
      }
    });
    const escrow = createEscrowPaymentRecordFixture({
      sessionId: sessionDetail.session.sessionId,
      quoteTermsHash: sessionDetail.session.quoteTermsHash
    });
    const app = buildServer({
      config: {
        databasePath,
        factoryCanisterId: "factory-canister-id"
      },
      factoryClient: new FactoryClient({
        configured: true,
        adapter: {
          async createSpawnSession(request) {
            return {
              session: {
                ...createdSession.session,
                stewardAddress: request.stewardAddress,
                asset: request.asset,
                grossAmount: request.grossAmount,
                config: request.config
              },
              quote: {
                sessionId: createdSession.session.sessionId,
                chain: request.config.chain,
                asset: request.asset,
                grossAmount: request.grossAmount,
                platformFee: createdSession.session.platformFee,
                creationCost: createdSession.session.creationCost,
                netForwardAmount: createdSession.session.netForwardAmount,
                quoteTermsHash: createdSession.session.quoteTermsHash,
                expiresAt: createdSession.session.expiresAt,
                payment: {
                  sessionId: createdSession.session.sessionId,
                  chain: request.config.chain,
                  asset: request.asset,
                  paymentAddress: "0x00000000000000000000000000000000000000ef",
                  grossAmount: request.grossAmount,
                  quoteTermsHash: createdSession.session.quoteTermsHash,
                  expiresAt: createdSession.session.expiresAt
                }
              }
            };
          },
          async getSpawnSession(sessionId) {
            return sessionId === sessionDetail.session.sessionId
              ? {
                  session: sessionDetail.session,
                  audit: sessionDetail.audit
                }
              : null;
          },
          async listSpawnedAutomatons() {
            return {
              items: [registryRecord],
              nextCursor: null
            };
          },
          async retrySpawnSession(sessionId) {
            return {
              session:
                sessionId === sessionDetail.session.sessionId
                  ? {
                      ...sessionDetail.session,
                      state: "payment_detected",
                      retryable: false
                    }
                  : sessionDetail.session
            };
          },
          async claimSpawnRefund(sessionId) {
            return {
              sessionId,
              state: "expired",
              paymentStatus: "refunded",
              refundedAt: 1_709_912_361_000
            };
          },
          async getSpawnedAutomaton(canisterId) {
            return canisterId === registryRecord.canisterId ? registryRecord : null;
          }
        }
      }),
      escrowClient: new EscrowClient({
        configured: true,
        adapter: {
          async getEscrowPayment(sessionId) {
            return sessionId === sessionDetail.session.sessionId ? escrow : null;
          }
        }
      })
    });
    await app.ready();
    const socket = await app.injectWS(`/ws/events?sessionId=${sessionDetail.session.sessionId}`);
    const eventMessage = waitForMessage(socket);

    const sessionResponse = await app.inject({
      method: "GET",
      url: `/api/spawn-sessions/${sessionDetail.session.sessionId}`
    });
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/spawn-sessions",
      payload: {
        stewardAddress: sessionDetail.session.stewardAddress,
        asset: sessionDetail.session.asset,
        grossAmount: sessionDetail.session.grossAmount,
        config: sessionDetail.session.config
      }
    });
    const retryResponse = await app.inject({
      method: "POST",
      url: `/api/spawn-sessions/${sessionDetail.session.sessionId}/retry`
    });
    const refundResponse = await app.inject({
      method: "POST",
      url: `/api/spawn-sessions/${sessionDetail.session.sessionId}/refund`
    });
    const registryResponse = await app.inject({
      method: "GET",
      url: "/api/spawned-automatons"
    });
    const registryRecordResponse = await app.inject({
      method: "GET",
      url: `/api/spawned-automatons/${registryRecord.canisterId}`
    });
    const automatonListResponse = await app.inject({
      method: "GET",
      url: "/api/automatons"
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json()).toEqual({
      session: sessionDetail.session,
      audit: sessionDetail.audit,
      escrow,
      registryRecord
    });
    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      session: {
        sessionId: createdSession.session.sessionId,
        stewardAddress: sessionDetail.session.stewardAddress
      },
      quote: {
        payment: {
          paymentAddress: "0x00000000000000000000000000000000000000ef"
        }
      }
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toEqual({
      session: {
        ...sessionDetail.session,
        state: "payment_detected",
        retryable: false
      }
    });
    expect(refundResponse.statusCode).toBe(200);
    expect(refundResponse.json()).toEqual({
      sessionId: sessionDetail.session.sessionId,
      state: "expired",
      paymentStatus: "refunded",
      refundedAt: 1_709_912_361_000
    });

    expect(registryResponse.statusCode).toBe(200);
    expect(registryResponse.json()).toEqual({
      items: [registryRecord],
      nextCursor: null
    });

    expect(registryRecordResponse.statusCode).toBe(200);
    expect(registryRecordResponse.json()).toEqual(registryRecord);

    expect(automatonListResponse.statusCode).toBe(200);
    expect(automatonListResponse.json()).toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    await expect(eventMessage).resolves.toContain(sessionDetail.session.sessionId);

    socket.close();
    await app.close();
  });
});
