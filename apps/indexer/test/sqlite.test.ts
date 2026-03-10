import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSqliteStore } from "../src/store/sqlite.js";
import {
  createAutomatonDetailFixture,
  createMonologueEntryFixture,
  createSpawnSessionDetailFixture,
  createSpawnedAutomatonRecordFixture
} from "./fixtures.js";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function createDatabasePath() {
  const directory = await mkdtemp(join(tmpdir(), "indexer-sqlite-"));
  tempPaths.push(directory);
  return join(directory, "indexer.sqlite");
}

describe("sqlite store", () => {
  it("bootstraps schema and returns empty state", async () => {
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });

    await store.initialize();

    await expect(store.getHealth()).resolves.toMatchObject({
      ok: true,
      driver: "better-sqlite3",
      counts: {
        configuredCanisters: 0,
        automatons: 0,
        monologueEntries: 0,
        spawnSessions: 0,
        spawnedAutomatonRegistryRecords: 0
      }
    });

    await expect(store.listAutomatons()).resolves.toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    await store.close();
  });

  it("syncs configured canister ids separately from indexed automaton records", async () => {
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });

    await store.initialize();
    await store.syncConfiguredCanisterIds([
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "txyno-ch777-77776-aaaaq-cai"
    ]);

    await expect(store.listConfiguredCanisterIds()).resolves.toEqual([
      "ryjl3-tyaaa-aaaaa-aaaba-cai",
      "txyno-ch777-77776-aaaaq-cai"
    ]);

    await expect(store.listAutomatons()).resolves.toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    await expect(store.getHealth()).resolves.toMatchObject({
      counts: {
        configuredCanisters: 2,
        automatons: 0
      }
    });

    await store.syncConfiguredCanisterIds(["txyno-ch777-77776-aaaaq-cai"]);

    await expect(store.listConfiguredCanisterIds()).resolves.toEqual([
      "txyno-ch777-77776-aaaaq-cai"
    ]);

    await store.close();
  });

  it("persists automaton details, monologue entries, and prices", async () => {
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });
    const automaton = createAutomatonDetailFixture();
    const entry = createMonologueEntryFixture();

    await store.initialize();
    await store.upsertAutomaton(automaton);
    await store.appendMonologue(automaton.canisterId, [entry]);
    await store.setPrice("ethUsd", 2_450.5);

    await expect(
      store.listAutomatons({
        steward: automaton.steward.address,
        chain: automaton.chain,
        tier: automaton.tier
      })
    ).resolves.toMatchObject({
      total: 1,
      prices: {
        ethUsd: 2_450.5
      }
    });

    await expect(store.getAutomatonDetail(automaton.canisterId)).resolves.toMatchObject({
      canisterId: automaton.canisterId,
      name: automaton.name
    });

    await expect(
      store.listMonologue(automaton.canisterId, {
        limit: 50
      })
    ).resolves.toEqual({
      entries: [entry],
      hasMore: false,
      nextCursor: null
    });

    await store.close();
  });

  it("persists spawn sessions separately from the public automaton list", async () => {
    const store = createSqliteStore({
      databasePath: await createDatabasePath()
    });
    const detail = createSpawnSessionDetailFixture();
    const secondRecord = createSpawnedAutomatonRecordFixture({
      canisterId: "ryjl3-tyaaa-aaaaa-aaabb-cai",
      sessionId: "session-1709912345000-2"
    });

    await store.initialize();
    await store.upsertSpawnSession(detail);
    await store.upsertSpawnedAutomatonRegistry([secondRecord]);

    await expect(store.listAutomatons()).resolves.toEqual({
      automatons: [],
      total: 0,
      prices: {
        ethUsd: null
      }
    });

    await expect(store.getSpawnSessionDetail(detail.session.sessionId)).resolves.toEqual(detail);

    await expect(
      store.listSpawnedAutomatonRegistry({
        limit: 10
      })
    ).resolves.toEqual({
      items: [detail.registryRecord, secondRecord],
      nextCursor: null
    });

    await expect(store.getHealth()).resolves.toMatchObject({
      counts: {
        spawnSessions: 1,
        spawnedAutomatonRegistryRecords: 2
      }
    });

    await store.close();
  });
});
