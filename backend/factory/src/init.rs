use crate::types::{AutomatonRuntimeState, SpawnSession};

pub fn initialize_automaton(
    session: &SpawnSession,
    canister_id: String,
    evm_address: String,
    now_ms: u64,
) -> AutomatonRuntimeState {
    AutomatonRuntimeState {
        canister_id,
        evm_address,
        steward_address: session.steward_address.clone(),
        session_id: session.session_id.clone(),
        initialized_at: now_ms,
        funded_amount: "0".to_string(),
        last_funded_at: None,
        controllers: vec!["factory".to_string()],
        chain: session.chain.clone(),
        risk: session.config.risk,
        strategies: session.config.strategies.clone(),
        skills: session.config.skills.clone(),
        model: session.config.provider.model.clone(),
        provider_keys_cleared: false,
    }
}
