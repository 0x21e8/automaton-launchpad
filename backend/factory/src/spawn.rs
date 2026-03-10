use crate::controllers::complete_controller_handoff;
use crate::expiry::expire_spawn_session;
use crate::init::initialize_automaton;
use crate::retry::mark_session_failed_in_state;
use crate::state::{clear_provider_secrets, read_state, record_session_audit, write_state};
use crate::types::{
    amount_to_string, parse_amount, FactoryError, PaymentStatus, SessionAuditActor,
    SpawnExecutionReceipt, SpawnSessionState, SpawnedAutomatonRecord,
};

pub fn execute_spawn(session_id: &str, now_ms: u64) -> Result<SpawnExecutionReceipt, FactoryError> {
    let expires_at = read_state(|state| {
        state
            .sessions
            .get(session_id)
            .map(|session| session.expires_at)
            .ok_or_else(|| FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            })
    })?;
    if now_ms > expires_at {
        let _ = expire_spawn_session(session_id, now_ms)?;
        return Err(FactoryError::SessionExpired {
            session_id: session_id.to_string(),
            expires_at,
        });
    }

    write_state(|state| {
        let (payment_status, session_state) =
            {
                let session = state.sessions.get(session_id).ok_or_else(|| {
                    FactoryError::SessionNotFound {
                        session_id: session_id.to_string(),
                    }
                })?;
                (session.payment_status.clone(), session.state.clone())
            };

        if payment_status != PaymentStatus::Paid {
            return Err(FactoryError::PaymentNotSettled {
                session_id: session_id.to_string(),
                status: payment_status,
            });
        }

        match session_state {
            SpawnSessionState::PaymentDetected | SpawnSessionState::Failed => {}
            SpawnSessionState::Complete => {
                let session = state.sessions.get(session_id).expect("session exists");
                return Ok(SpawnExecutionReceipt {
                    session_id: session.session_id.clone(),
                    automaton_canister_id: session
                        .automaton_canister_id
                        .clone()
                        .expect("completed session has canister id"),
                    automaton_evm_address: session
                        .automaton_evm_address
                        .clone()
                        .expect("completed session has evm address"),
                    funded_amount: session.net_forward_amount.clone(),
                    controller: format!(
                        "controller:{}",
                        session
                            .automaton_canister_id
                            .clone()
                            .expect("completed session has canister id")
                    ),
                    completed_at: session.updated_at,
                });
            }
            state => {
                return Err(FactoryError::SessionNotReadyForSpawn {
                    session_id: session_id.to_string(),
                    state,
                });
            }
        }

        let previous_state = {
            let session = state.sessions.get(session_id).expect("session exists");
            session.state.clone()
        };
        {
            let session = state.sessions.get_mut(session_id).expect("session exists");
            session.state = SpawnSessionState::Spawning;
            session.retryable = false;
            session.refundable = false;
            session.updated_at = now_ms;
        }
        record_session_audit(
            state,
            session_id,
            Some(previous_state),
            SpawnSessionState::Spawning,
            SessionAuditActor::System,
            now_ms,
            "spawn execution started",
        );

        state.next_automaton_nonce += 1;

        let version_commit = state.version_commit.clone();
        let mut runtime = {
            let session = state.sessions.get(session_id).expect("session exists");
            let canister_id = session
                .automaton_canister_id
                .clone()
                .unwrap_or_else(|| format!("automaton-{:04}", state.next_automaton_nonce));
            let evm_address = session
                .automaton_evm_address
                .clone()
                .unwrap_or_else(|| format!("0x{:040x}", state.next_automaton_nonce));
            initialize_automaton(session, canister_id, evm_address, now_ms)
        };

        {
            let session = state.sessions.get_mut(session_id).expect("session exists");
            session.automaton_canister_id = Some(runtime.canister_id.clone());
            session.automaton_evm_address = Some(runtime.evm_address.clone());
            session.state = SpawnSessionState::FundingAutomaton;
            session.updated_at = now_ms;
        }
        record_session_audit(
            state,
            session_id,
            Some(SpawnSessionState::Spawning),
            SpawnSessionState::FundingAutomaton,
            SessionAuditActor::System,
            now_ms,
            "automaton initialized",
        );

        let net_forward_amount = {
            let session = state.sessions.get(session_id).expect("session exists");
            match parse_amount(&session.net_forward_amount) {
                Ok(value) => value,
                Err(error) => {
                    let _ = mark_session_failed_in_state(
                        state,
                        session_id,
                        SessionAuditActor::System,
                        now_ms,
                        "spawn funding preparation failed",
                    )?;
                    return Err(error);
                }
            }
        };
        runtime.funded_amount = amount_to_string(net_forward_amount);
        runtime.last_funded_at = Some(now_ms);

        let controller = match complete_controller_handoff(&mut runtime, "factory") {
            Ok(controller) => controller,
            Err(error) => {
                state.runtimes.insert(runtime.canister_id.clone(), runtime);
                let _ = mark_session_failed_in_state(
                    state,
                    session_id,
                    SessionAuditActor::System,
                    now_ms,
                    "controller handoff failed",
                )?;
                return Err(error);
            }
        };

        let registry_record = {
            let session = state.sessions.get_mut(session_id).expect("session exists");
            clear_provider_secrets(session, Some(&mut runtime));
            session.state = SpawnSessionState::Complete;
            session.retryable = false;
            session.refundable = false;
            session.updated_at = now_ms;

            SpawnedAutomatonRecord {
                canister_id: runtime.canister_id.clone(),
                steward_address: session.steward_address.clone(),
                evm_address: runtime.evm_address.clone(),
                chain: session.chain.clone(),
                session_id: session.session_id.clone(),
                parent_id: session.parent_id.clone(),
                child_ids: session.child_ids.clone(),
                created_at: now_ms,
                version_commit,
            }
        };

        if let Some(parent_id) = registry_record.parent_id.as_ref() {
            if let Some(parent) = state.registry.get_mut(parent_id) {
                if parent
                    .child_ids
                    .iter()
                    .all(|child_id| child_id != &registry_record.canister_id)
                {
                    parent.child_ids.push(registry_record.canister_id.clone());
                }
            }
        }

        state
            .runtimes
            .insert(runtime.canister_id.clone(), runtime.clone());
        state
            .registry
            .insert(registry_record.canister_id.clone(), registry_record);
        record_session_audit(
            state,
            session_id,
            Some(SpawnSessionState::FundingAutomaton),
            SpawnSessionState::Complete,
            SessionAuditActor::System,
            now_ms,
            "spawn completed and controller handoff finalized",
        );

        Ok(SpawnExecutionReceipt {
            session_id: session_id.to_string(),
            automaton_canister_id: runtime.canister_id,
            automaton_evm_address: runtime.evm_address,
            funded_amount: amount_to_string(net_forward_amount),
            controller,
            completed_at: now_ms,
        })
    })
}
