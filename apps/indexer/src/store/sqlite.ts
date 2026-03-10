import { access, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import type {
  AutomatonDetail,
  AutomatonListResponse,
  AutomatonSummary,
  AutomatonTier,
  ChainSlug,
  MonologueEntry,
  MonologuePage,
  SpawnSessionDetail,
  SpawnedAutomatonRecord
} from "@ic-automaton/shared";

const require = createRequire(import.meta.url);

type SqliteValue = null | number | string;

interface BetterSqliteStatement<Row extends Record<string, SqliteValue>> {
  all(...parameters: SqliteValue[]): Row[];
  get(...parameters: SqliteValue[]): Row | undefined;
  run(...parameters: SqliteValue[]): void;
}

interface BetterSqliteDatabase {
  close(): void;
  exec(sql: string): this;
  prepare<Row extends Record<string, SqliteValue>>(sql: string): BetterSqliteStatement<Row>;
  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void;
}

interface BetterSqliteConstructor {
  new (path: string): BetterSqliteDatabase;
}

const BetterSqlite3 = require("better-sqlite3") as BetterSqliteConstructor;

export interface AutomatonFilters {
  steward?: string;
  chain?: ChainSlug;
  tier?: AutomatonTier;
}

export interface MonologueQuery {
  before?: number;
  limit: number;
}

export interface StoreHealth {
  ok: boolean;
  driver: "better-sqlite3";
  databasePath: string;
  counts: {
    configuredCanisters: number;
    automatons: number;
    monologueEntries: number;
    spawnSessions: number;
    spawnedAutomatonRegistryRecords: number;
  };
}

export interface SpawnRegistryQuery {
  cursor?: string;
  limit: number;
}

export interface IndexerStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getHealth(): Promise<StoreHealth>;
  listConfiguredCanisterIds(): Promise<string[]>;
  syncConfiguredCanisterIds(canisterIds: string[]): Promise<void>;
  listAutomatons(filters?: AutomatonFilters): Promise<AutomatonListResponse>;
  getAutomatonDetail(canisterId: string): Promise<AutomatonDetail | null>;
  upsertAutomaton(detail: AutomatonDetail): Promise<void>;
  listMonologue(canisterId: string, query: MonologueQuery): Promise<MonologuePage>;
  appendMonologue(canisterId: string, entries: MonologueEntry[]): Promise<void>;
  getSpawnSessionDetail(sessionId: string): Promise<SpawnSessionDetail | null>;
  upsertSpawnSession(detail: SpawnSessionDetail): Promise<void>;
  listSpawnedAutomatonRegistry(query: SpawnRegistryQuery): Promise<{
    items: SpawnedAutomatonRecord[];
    nextCursor: string | null;
  }>;
  getSpawnedAutomatonRegistryRecord(canisterId: string): Promise<SpawnedAutomatonRecord | null>;
  upsertSpawnedAutomatonRegistry(records: SpawnedAutomatonRecord[]): Promise<void>;
  setPrice(symbol: string, value: number | null): Promise<void>;
}

interface SqliteStoreOptions {
  databasePath: string;
}

function detailToSummary(detail: AutomatonDetail): AutomatonSummary {
  return {
    canisterId: detail.canisterId,
    ethAddress: detail.ethAddress,
    chain: detail.chain,
    chainId: detail.chainId,
    name: detail.name,
    tier: detail.tier,
    agentState: detail.runtime.agentState,
    ethBalanceWei: detail.financials.ethBalanceWei,
    usdcBalanceRaw: detail.financials.usdcBalanceRaw,
    cyclesBalance: detail.financials.cyclesBalance,
    netWorthEth: detail.financials.netWorthEth,
    netWorthUsd: detail.financials.netWorthUsd,
    heartbeatIntervalSeconds: detail.runtime.heartbeatIntervalSeconds,
    steward: detail.steward,
    gridPosition: detail.gridPosition,
    corePatternIndex: detail.corePatternIndex,
    corePattern: detail.corePattern,
    parentId: detail.parentId,
    createdAt: detail.createdAt,
    lastTransitionAt: detail.runtime.lastTransitionAt
  };
}

async function loadSchemaSql() {
  const candidates = [
    new URL("./schema.sql", import.meta.url),
    new URL("../../src/store/schema.sql", import.meta.url)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return await readFile(candidate, "utf8");
    } catch {
      continue;
    }
  }

  throw new Error("Unable to locate SQLite schema.sql");
}

class BetterSqliteStore implements IndexerStore {
  readonly databasePath: string;

  private database?: BetterSqliteDatabase;
  private initialized = false;
  private readonly schemaSqlPromise: Promise<string>;

  constructor(options: SqliteStoreOptions) {
    this.databasePath = options.databasePath;
    this.schemaSqlPromise = loadSchemaSql();
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    await mkdir(dirname(this.databasePath), { recursive: true });
    this.database = new BetterSqlite3(this.databasePath);
    this.database.exec(await this.schemaSqlPromise);
    this.initialized = true;
  }

  async close() {
    this.database?.close();
    this.database = undefined;
    this.initialized = false;
  }

  async getHealth(): Promise<StoreHealth> {
    await this.initialize();
    const database = this.getDatabase();
    const configuredCanisterCountRow = database
      .prepare<{ count: number }>("SELECT COUNT(*) AS count FROM configured_canisters;")
      .get();
    const automatonCountRow = database
      .prepare<{ count: number }>("SELECT COUNT(*) AS count FROM automatons;")
      .get();
    const monologueCountRow = database
      .prepare<{ count: number }>("SELECT COUNT(*) AS count FROM monologue;")
      .get();
    const spawnSessionCountRow = database
      .prepare<{ count: number }>("SELECT COUNT(*) AS count FROM spawn_sessions;")
      .get();
    const spawnRegistryCountRow = database
      .prepare<{ count: number }>("SELECT COUNT(*) AS count FROM spawned_automaton_registry;")
      .get();

    return {
      ok: true,
      driver: "better-sqlite3",
      databasePath: this.databasePath,
      counts: {
        configuredCanisters: Number(configuredCanisterCountRow?.count ?? 0),
        automatons: Number(automatonCountRow?.count ?? 0),
        monologueEntries: Number(monologueCountRow?.count ?? 0),
        spawnSessions: Number(spawnSessionCountRow?.count ?? 0),
        spawnedAutomatonRegistryRecords: Number(spawnRegistryCountRow?.count ?? 0)
      }
    };
  }

  async listConfiguredCanisterIds() {
    await this.initialize();
    const database = this.getDatabase();
    const rows = database
      .prepare<{ canister_id: string }>(
        `SELECT canister_id
         FROM configured_canisters
         ORDER BY canister_id ASC;`
      )
      .all();

    return rows.map((row) => row.canister_id);
  }

  async syncConfiguredCanisterIds(canisterIds: string[]) {
    await this.initialize();
    const database = this.getDatabase();
    const normalizedCanisterIds = [...new Set(canisterIds.map((canisterId) => canisterId.trim()))];
    const updatedAt = Date.now();
    const upsertStatement = database.prepare(
      `INSERT INTO configured_canisters (canister_id, source, updated_at)
       VALUES (?, 'config', ?)
       ON CONFLICT(canister_id) DO UPDATE SET
         source = excluded.source,
         updated_at = excluded.updated_at;`
    );
    const deleteMissingStatement = database.prepare(
      `DELETE FROM configured_canisters
       WHERE source = 'config'
         AND canister_id NOT IN (${normalizedCanisterIds.map(() => "?").join(", ")});`
    );
    const syncConfiguredCanisters = database.transaction((configuredIds: string[]) => {
      for (const canisterId of configuredIds) {
        upsertStatement.run(canisterId, updatedAt);
      }

      deleteMissingStatement.run(...configuredIds);
    });

    syncConfiguredCanisters(normalizedCanisterIds);
  }

  async listAutomatons(filters: AutomatonFilters = {}): Promise<AutomatonListResponse> {
    await this.initialize();
    const database = this.getDatabase();

    const where: string[] = [];
    const parameters: SqliteValue[] = [];

    if (filters.steward) {
      where.push("steward_address = ?");
      parameters.push(filters.steward);
    }
    if (filters.chain) {
      where.push("chain = ?");
      parameters.push(filters.chain);
    }
    if (filters.tier) {
      where.push("tier = ?");
      parameters.push(filters.tier);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const summaryRows = database
      .prepare<{ summary_json: string }>(
        `SELECT summary_json
         FROM automatons
         ${whereClause}
         ORDER BY last_transition_at DESC, canister_id ASC;`
      )
      .all(...parameters);
    const summaries = summaryRows.map((row) => {
      return JSON.parse(row.summary_json) as AutomatonSummary;
    });
    const price = await this.getPrice("ethUsd");

    return {
      automatons: summaries,
      total: summaries.length,
      prices: {
        ethUsd: price
      }
    };
  }

  async getAutomatonDetail(canisterId: string) {
    await this.initialize();
    const database = this.getDatabase();
    const row = database
      .prepare<{ detail_json: string }>(
        `SELECT detail_json
         FROM automatons
         WHERE canister_id = ?
         LIMIT 1;`
      )
      .get(canisterId);

    if (!row) {
      return null;
    }

    const detail = JSON.parse(row.detail_json) as AutomatonDetail;
    const monologue = await this.listMonologue(canisterId, {
      limit: 50
    });

    return {
      ...detail,
      monologue: monologue.entries
    };
  }

  async upsertAutomaton(detail: AutomatonDetail) {
    await this.initialize();
    const database = this.getDatabase();
    const summary = detailToSummary(detail);
    const now = Date.now();

    database
      .prepare(
        `INSERT INTO automatons (
          canister_id,
          steward_address,
          chain,
          tier,
          last_transition_at,
          created_at,
          updated_at,
          summary_json,
          detail_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canister_id) DO UPDATE SET
          steward_address = excluded.steward_address,
          chain = excluded.chain,
          tier = excluded.tier,
          last_transition_at = excluded.last_transition_at,
          updated_at = excluded.updated_at,
          summary_json = excluded.summary_json,
          detail_json = excluded.detail_json;`
      )
      .run(
        detail.canisterId,
        detail.steward.address,
        detail.chain,
        detail.tier,
        detail.runtime.lastTransitionAt,
        detail.createdAt,
        now,
        JSON.stringify(summary),
        JSON.stringify(detail)
      );
  }

  async listMonologue(canisterId: string, query: MonologueQuery): Promise<MonologuePage> {
    await this.initialize();
    const database = this.getDatabase();

    const clauses = ["canister_id = ?"];
    const parameters: SqliteValue[] = [canisterId];
    if (query.before !== undefined) {
      clauses.push("timestamp < ?");
      parameters.push(query.before);
    }
    parameters.push(query.limit + 1);

    const rows = database
      .prepare<{ entry_json: string }>(
        `SELECT entry_json
         FROM monologue
         WHERE ${clauses.join(" AND ")}
         ORDER BY timestamp DESC, turn_id DESC
         LIMIT ?;`
      )
      .all(...parameters);

    const hasMore = rows.length > query.limit;
    const entries = rows.slice(0, query.limit).map((row) => {
      return JSON.parse(row.entry_json) as MonologueEntry;
    });
    const lastEntry = entries.at(-1);

    return {
      entries,
      hasMore,
      nextCursor: hasMore && lastEntry ? lastEntry.timestamp : null
    };
  }

  async appendMonologue(canisterId: string, entries: MonologueEntry[]) {
    await this.initialize();
    const database = this.getDatabase();

    if (entries.length === 0) {
      return;
    }

    const statement = database.prepare(
      `INSERT INTO monologue (canister_id, timestamp, turn_id, entry_json)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(canister_id, timestamp, turn_id) DO UPDATE SET
         entry_json = excluded.entry_json;`
    );
    const insertEntries = database.transaction((records: MonologueEntry[]) => {
      for (const entry of records) {
        statement.run(canisterId, entry.timestamp, entry.turnId, JSON.stringify(entry));
      }
    });

    insertEntries(entries);
  }

  async getSpawnSessionDetail(sessionId: string) {
    await this.initialize();
    const database = this.getDatabase();
    const row = database
      .prepare<{
        session_json: string;
        audit_json: string;
        escrow_json: string | null;
        registry_json: string | null;
      }>(
        `SELECT session_json, audit_json, escrow_json, registry_json
         FROM spawn_sessions
         WHERE session_id = ?
         LIMIT 1;`
      )
      .get(sessionId);

    if (!row) {
      return null;
    }

    return {
      session: JSON.parse(row.session_json) as SpawnSessionDetail["session"],
      audit: JSON.parse(row.audit_json) as SpawnSessionDetail["audit"],
      escrow:
        row.escrow_json === null
          ? null
          : (JSON.parse(row.escrow_json) as SpawnSessionDetail["escrow"]),
      registryRecord:
        row.registry_json === null
          ? null
          : (JSON.parse(row.registry_json) as SpawnSessionDetail["registryRecord"])
    } satisfies SpawnSessionDetail;
  }

  async upsertSpawnSession(detail: SpawnSessionDetail) {
    await this.initialize();
    const database = this.getDatabase();

    database
      .prepare(
        `INSERT INTO spawn_sessions (
          session_id,
          state,
          payment_status,
          retryable,
          refundable,
          updated_at,
          session_json,
          audit_json,
          escrow_json,
          registry_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          state = excluded.state,
          payment_status = excluded.payment_status,
          retryable = excluded.retryable,
          refundable = excluded.refundable,
          updated_at = excluded.updated_at,
          session_json = excluded.session_json,
          audit_json = excluded.audit_json,
          escrow_json = excluded.escrow_json,
          registry_json = excluded.registry_json;`
      )
      .run(
        detail.session.sessionId,
        detail.session.state,
        detail.session.paymentStatus,
        detail.session.retryable ? 1 : 0,
        detail.session.refundable ? 1 : 0,
        detail.session.updatedAt,
        JSON.stringify(detail.session),
        JSON.stringify(detail.audit),
        detail.escrow ? JSON.stringify(detail.escrow) : null,
        detail.registryRecord ? JSON.stringify(detail.registryRecord) : null
      );

    if (detail.registryRecord) {
      await this.upsertSpawnedAutomatonRegistry([detail.registryRecord]);
    }
  }

  async listSpawnedAutomatonRegistry(query: SpawnRegistryQuery) {
    await this.initialize();
    const database = this.getDatabase();
    const clauses: string[] = [];
    const parameters: SqliteValue[] = [];

    if (query.cursor) {
      clauses.push("canister_id > ?");
      parameters.push(query.cursor);
    }

    parameters.push(query.limit + 1);
    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = database
      .prepare<{ record_json: string }>(
        `SELECT record_json
         FROM spawned_automaton_registry
         ${whereClause}
         ORDER BY canister_id ASC
         LIMIT ?;`
      )
      .all(...parameters);

    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map((row) => {
      return JSON.parse(row.record_json) as SpawnedAutomatonRecord;
    });

    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.canisterId ?? null : null
    };
  }

  async getSpawnedAutomatonRegistryRecord(canisterId: string) {
    await this.initialize();
    const database = this.getDatabase();
    const row = database
      .prepare<{ record_json: string }>(
        `SELECT record_json
         FROM spawned_automaton_registry
         WHERE canister_id = ?
         LIMIT 1;`
      )
      .get(canisterId);

    if (!row) {
      return null;
    }

    return JSON.parse(row.record_json) as SpawnedAutomatonRecord;
  }

  async upsertSpawnedAutomatonRegistry(records: SpawnedAutomatonRecord[]) {
    await this.initialize();
    const database = this.getDatabase();

    if (records.length === 0) {
      return;
    }

    const statement = database.prepare(
      `INSERT INTO spawned_automaton_registry (
        canister_id,
        session_id,
        steward_address,
        chain,
        created_at,
        updated_at,
        record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(canister_id) DO UPDATE SET
        session_id = excluded.session_id,
        steward_address = excluded.steward_address,
        chain = excluded.chain,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        record_json = excluded.record_json;`
    );
    const upsertRecords = database.transaction((registryRecords: SpawnedAutomatonRecord[]) => {
      const updatedAt = Date.now();

      for (const record of registryRecords) {
        statement.run(
          record.canisterId,
          record.sessionId,
          record.stewardAddress,
          record.chain,
          record.createdAt,
          updatedAt,
          JSON.stringify(record)
        );
      }
    });

    upsertRecords(records);
  }

  async setPrice(symbol: string, value: number | null) {
    await this.initialize();
    const database = this.getDatabase();

    database
      .prepare(
        `INSERT INTO prices (symbol, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(symbol) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at;`
      )
      .run(symbol, value, Date.now());
  }

  private async getPrice(symbol: string) {
    const database = this.getDatabase();
    const row = database
      .prepare<{ value: number | null }>(
        `SELECT value
         FROM prices
         WHERE symbol = ?
         LIMIT 1;`
      )
      .get(symbol);

    return row?.value === null || row?.value === undefined ? null : Number(row.value);
  }

  private getDatabase() {
    if (!this.database) {
      throw new Error("SQLite store accessed before initialization");
    }

    return this.database;
  }
}

export function createSqliteStore(options: SqliteStoreOptions): IndexerStore {
  return new BetterSqliteStore(options);
}
