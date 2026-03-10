use crate::escrow::{claim_escrow_refund, register_escrow_claim};
use crate::expiry::expire_spawn_session;
use crate::retry::retry_failed_session;
use crate::state::{read_state, record_session_audit, write_state};
use crate::types::{
    amount_to_string, hash_quote_terms, parse_amount, CreateSpawnSessionRequest,
    CreateSpawnSessionResponse, FactoryError, RefundSpawnResponse, SessionAuditActor,
    SpawnPaymentInstructions, SpawnQuote, SpawnSession, SpawnSessionState,
    SpawnSessionStatusResponse, SpawnedAutomatonRegistryPage,
};

fn ensure_steward(caller: &str, session_id: &str) -> Result<(), FactoryError> {
    read_state(|state| {
        let session =
            state
                .sessions
                .get(session_id)
                .ok_or_else(|| FactoryError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;

        if session.steward_address == caller {
            return Ok(());
        }

        Err(FactoryError::UnauthorizedSteward {
            caller: caller.to_string(),
            session_id: session_id.to_string(),
        })
    })
}

pub fn create_spawn_session(
    request: CreateSpawnSessionRequest,
    now_ms: u64,
) -> Result<CreateSpawnSessionResponse, FactoryError> {
    let (session, quote) = write_state(|state| {
        if state.paused {
            return Err(FactoryError::FactoryPaused { pause: true });
        }

        let gross_amount_value = parse_amount(&request.gross_amount)?;
        let platform_fee_value = parse_amount(state.fee_config.amount_for(&request.asset))?;
        let creation_cost_value =
            parse_amount(state.creation_cost_quote.amount_for(&request.asset))?;
        let required_minimum = platform_fee_value + creation_cost_value;

        if gross_amount_value < required_minimum {
            return Err(FactoryError::GrossBelowRequiredMinimum {
                provided: request.gross_amount.clone(),
                required: amount_to_string(required_minimum),
            });
        }

        state.next_session_nonce += 1;
        let session_id = format!("session-{}-{}", now_ms, state.next_session_nonce);
        let expires_at = now_ms + state.session_ttl_ms;
        let platform_fee = amount_to_string(platform_fee_value);
        let creation_cost = amount_to_string(creation_cost_value);
        let net_forward_amount = amount_to_string(gross_amount_value - required_minimum);
        let quote_terms_hash = hash_quote_terms(&[
            &session_id,
            &request.steward_address,
            request.asset.as_str(),
            &request.gross_amount,
            &platform_fee,
            &creation_cost,
            &net_forward_amount,
            &expires_at.to_string(),
            &state.payment_address,
        ]);
        let payment = SpawnPaymentInstructions {
            session_id: session_id.clone(),
            chain: request.config.chain.clone(),
            asset: request.asset.clone(),
            payment_address: state.payment_address.clone(),
            gross_amount: request.gross_amount.clone(),
            quote_terms_hash: quote_terms_hash.clone(),
            expires_at,
        };
        let session = SpawnSession {
            session_id: session_id.clone(),
            steward_address: request.steward_address.clone(),
            chain: request.config.chain.clone(),
            asset: request.asset.clone(),
            gross_amount: request.gross_amount.clone(),
            platform_fee: platform_fee.clone(),
            creation_cost: creation_cost.clone(),
            net_forward_amount: net_forward_amount.clone(),
            quote_terms_hash: quote_terms_hash.clone(),
            expires_at,
            state: SpawnSessionState::AwaitingPayment,
            retryable: false,
            refundable: false,
            payment_status: crate::types::PaymentStatus::Unpaid,
            automaton_canister_id: None,
            automaton_evm_address: None,
            parent_id: request.parent_id.clone(),
            child_ids: Vec::new(),
            config: request.config.clone(),
            created_at: now_ms,
            updated_at: now_ms,
            payment: payment.clone(),
        };
        let quote = SpawnQuote {
            session_id: session_id.clone(),
            chain: request.config.chain.clone(),
            asset: request.asset.clone(),
            gross_amount: request.gross_amount.clone(),
            platform_fee,
            creation_cost,
            net_forward_amount,
            quote_terms_hash,
            expires_at,
            payment,
        };

        state.sessions.insert(session_id.clone(), session.clone());
        record_session_audit(
            state,
            &session_id,
            None,
            SpawnSessionState::AwaitingPayment,
            SessionAuditActor::User,
            now_ms,
            "session created",
        );

        Ok((session, quote))
    })?;

    register_escrow_claim(&session, now_ms);

    Ok(CreateSpawnSessionResponse { session, quote })
}

pub fn get_spawn_session(session_id: &str) -> Result<SpawnSessionStatusResponse, FactoryError> {
    read_state(|state| {
        let session = state.sessions.get(session_id).cloned().ok_or_else(|| {
            FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            }
        })?;
        let audit = state.audit_log.get(session_id).cloned().unwrap_or_default();

        Ok(SpawnSessionStatusResponse { session, audit })
    })
}

pub fn retry_spawn_session(
    caller: &str,
    session_id: &str,
    now_ms: u64,
) -> Result<SpawnSessionStatusResponse, FactoryError> {
    ensure_steward(caller, session_id)?;
    let _ = expire_spawn_session(session_id, now_ms)?;
    retry_failed_session(
        session_id,
        SessionAuditActor::User,
        now_ms,
        "retry requested by steward",
    )?;
    get_spawn_session(session_id)
}

pub fn claim_spawn_refund(
    caller: &str,
    session_id: &str,
    now_ms: u64,
) -> Result<RefundSpawnResponse, FactoryError> {
    ensure_steward(caller, session_id)?;
    let _ = expire_spawn_session(session_id, now_ms)?;
    claim_escrow_refund(session_id, now_ms)
}

pub fn list_spawned_automatons(
    cursor: Option<&str>,
    limit: usize,
) -> Result<SpawnedAutomatonRegistryPage, FactoryError> {
    if limit == 0 {
        return Err(FactoryError::InvalidPaginationLimit { limit });
    }

    read_state(|state| {
        let mut items: Vec<crate::types::SpawnedAutomatonRecord> = Vec::new();
        let mut next_cursor = None;
        let mut seen_cursor = cursor.is_none();

        for (canister_id, record) in &state.registry {
            if !seen_cursor {
                if Some(canister_id.as_str()) == cursor {
                    seen_cursor = true;
                }
                continue;
            }

            if items.len() == limit {
                next_cursor = Some(
                    items
                        .last()
                        .expect("page has at least one item")
                        .canister_id
                        .clone(),
                );
                break;
            }

            items.push(record.clone());
        }

        Ok(SpawnedAutomatonRegistryPage { items, next_cursor })
    })
}

pub fn get_spawned_automaton(
    canister_id: &str,
) -> Result<crate::types::SpawnedAutomatonRecord, FactoryError> {
    read_state(|state| {
        state.registry.get(canister_id).cloned().ok_or_else(|| {
            FactoryError::RegistryRecordNotFound {
                canister_id: canister_id.to_string(),
            }
        })
    })
}
