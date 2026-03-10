use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use crate::types::{
    AutomatonRuntimeState, CreationCostQuote, EscrowClaim, FeeConfig, SessionAuditActor,
    SessionAuditEntry, SpawnSession, SpawnSessionState, SpawnedAutomatonRecord,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryState {
    pub sessions: BTreeMap<String, SpawnSession>,
    pub escrow_claims: BTreeMap<String, EscrowClaim>,
    pub registry: BTreeMap<String, SpawnedAutomatonRecord>,
    pub runtimes: BTreeMap<String, AutomatonRuntimeState>,
    pub audit_log: BTreeMap<String, Vec<SessionAuditEntry>>,
    pub fee_config: FeeConfig,
    pub creation_cost_quote: CreationCostQuote,
    pub paused: bool,
    pub next_session_nonce: u64,
    pub next_automaton_nonce: u64,
    pub payment_address: String,
    pub admin_principals: BTreeSet<String>,
    pub session_ttl_ms: u64,
    pub version_commit: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryStateSnapshot {
    pub sessions: BTreeMap<String, SpawnSession>,
    pub escrow_claims: BTreeMap<String, EscrowClaim>,
    pub registry: BTreeMap<String, SpawnedAutomatonRecord>,
    pub runtimes: BTreeMap<String, AutomatonRuntimeState>,
    pub audit_log: BTreeMap<String, Vec<SessionAuditEntry>>,
    pub fee_config: FeeConfig,
    pub creation_cost_quote: CreationCostQuote,
    pub pause: bool,
    pub next_session_nonce: u64,
    pub next_automaton_nonce: u64,
    pub payment_address: String,
    pub admin_principals: BTreeSet<String>,
    pub session_ttl_ms: u64,
    pub version_commit: String,
}

impl Default for FactoryState {
    fn default() -> Self {
        let mut admin_principals = BTreeSet::new();
        admin_principals.insert("admin".to_string());

        Self {
            sessions: BTreeMap::new(),
            escrow_claims: BTreeMap::new(),
            registry: BTreeMap::new(),
            runtimes: BTreeMap::new(),
            audit_log: BTreeMap::new(),
            fee_config: FeeConfig {
                eth_fee: "5000000000000000".to_string(),
                usdc_fee: "5000000".to_string(),
                updated_at: 0,
            },
            creation_cost_quote: CreationCostQuote {
                eth_cost: "15000000000000000".to_string(),
                usdc_cost: "45000000".to_string(),
                updated_at: 0,
            },
            paused: false,
            next_session_nonce: 0,
            next_automaton_nonce: 0,
            payment_address: "0xFactoryEscrowVault".to_string(),
            admin_principals,
            session_ttl_ms: 30 * 60 * 1_000,
            version_commit: "dev-build".to_string(),
        }
    }
}

impl Default for FactoryStateSnapshot {
    fn default() -> Self {
        FactoryState::default().into()
    }
}

impl From<FactoryState> for FactoryStateSnapshot {
    fn from(value: FactoryState) -> Self {
        Self {
            sessions: value.sessions,
            escrow_claims: value.escrow_claims,
            registry: value.registry,
            runtimes: value.runtimes,
            audit_log: value.audit_log,
            fee_config: value.fee_config,
            creation_cost_quote: value.creation_cost_quote,
            pause: value.paused,
            next_session_nonce: value.next_session_nonce,
            next_automaton_nonce: value.next_automaton_nonce,
            payment_address: value.payment_address,
            admin_principals: value.admin_principals,
            session_ttl_ms: value.session_ttl_ms,
            version_commit: value.version_commit,
        }
    }
}

impl From<FactoryStateSnapshot> for FactoryState {
    fn from(value: FactoryStateSnapshot) -> Self {
        Self {
            sessions: value.sessions,
            escrow_claims: value.escrow_claims,
            registry: value.registry,
            runtimes: value.runtimes,
            audit_log: value.audit_log,
            fee_config: value.fee_config,
            creation_cost_quote: value.creation_cost_quote,
            paused: value.pause,
            next_session_nonce: value.next_session_nonce,
            next_automaton_nonce: value.next_automaton_nonce,
            payment_address: value.payment_address,
            admin_principals: value.admin_principals,
            session_ttl_ms: value.session_ttl_ms,
            version_commit: value.version_commit,
        }
    }
}

thread_local! {
    static FACTORY_STATE: RefCell<FactoryState> = RefCell::new(FactoryState::default());
}

pub fn read_state<T>(reader: impl FnOnce(&FactoryState) -> T) -> T {
    FACTORY_STATE.with(|state| reader(&state.borrow()))
}

pub fn write_state<T>(writer: impl FnOnce(&mut FactoryState) -> T) -> T {
    FACTORY_STATE.with(|state| writer(&mut state.borrow_mut()))
}

pub fn snapshot_state() -> FactoryStateSnapshot {
    read_state(|state| state.clone().into())
}

pub fn restore_state(snapshot: FactoryStateSnapshot) {
    write_state(|state| {
        *state = snapshot.into();
    });
}

pub fn insert_spawned_automaton_record(record: SpawnedAutomatonRecord) {
    write_state(|state| {
        state.registry.insert(record.canister_id.clone(), record);
    });
}

pub fn clear_provider_secrets(
    session: &mut SpawnSession,
    runtime: Option<&mut AutomatonRuntimeState>,
) {
    session.config.provider.open_router_api_key = None;
    session.config.provider.brave_search_api_key = None;

    if let Some(runtime) = runtime {
        runtime.provider_keys_cleared = true;
    }
}

pub fn record_session_audit(
    state: &mut FactoryState,
    session_id: &str,
    from_state: Option<SpawnSessionState>,
    to_state: SpawnSessionState,
    actor: SessionAuditActor,
    timestamp: u64,
    reason: &str,
) {
    state
        .audit_log
        .entry(session_id.to_string())
        .or_default()
        .push(SessionAuditEntry {
            session_id: session_id.to_string(),
            timestamp,
            from_state,
            to_state,
            actor,
            reason: reason.to_string(),
        });
}
