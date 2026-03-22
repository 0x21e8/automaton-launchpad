PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS automatons (
  canister_id TEXT PRIMARY KEY,
  steward_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  tier TEXT NOT NULL,
  last_transition_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  detail_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS automatons_steward_idx
  ON automatons (steward_address);

CREATE INDEX IF NOT EXISTS automatons_chain_idx
  ON automatons (chain);

CREATE INDEX IF NOT EXISTS automatons_tier_idx
  ON automatons (tier);

CREATE TABLE IF NOT EXISTS monologue (
  canister_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  turn_id TEXT NOT NULL,
  entry_json TEXT NOT NULL,
  PRIMARY KEY (canister_id, timestamp, turn_id)
);

CREATE INDEX IF NOT EXISTS monologue_canister_ts_idx
  ON monologue (canister_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS ens_cache (
  address TEXT PRIMARY KEY,
  ens_name TEXT,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT PRIMARY KEY,
  value REAL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS configured_canisters (
  canister_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS configured_canisters_source_idx
  ON configured_canisters (source);

CREATE TABLE IF NOT EXISTS spawn_sessions (
  session_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  retryable INTEGER NOT NULL,
  refundable INTEGER NOT NULL,
  claim_id TEXT NOT NULL,
  release_tx_hash TEXT,
  release_broadcast_at INTEGER,
  updated_at INTEGER NOT NULL,
  session_json TEXT NOT NULL,
  payment_json TEXT,
  audit_json TEXT NOT NULL,
  registry_json TEXT
);

CREATE INDEX IF NOT EXISTS spawn_sessions_state_idx
  ON spawn_sessions (state);

CREATE INDEX IF NOT EXISTS spawn_sessions_payment_status_idx
  ON spawn_sessions (payment_status);

CREATE INDEX IF NOT EXISTS spawn_sessions_claim_id_idx
  ON spawn_sessions (claim_id);

CREATE TABLE IF NOT EXISTS spawned_automaton_registry (
  canister_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  steward_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  record_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS spawned_automaton_registry_session_idx
  ON spawned_automaton_registry (session_id);
