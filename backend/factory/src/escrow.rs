use crate::controllers::complete_controller_handoff;
use crate::expiry::expire_session_in_state;
use crate::state::{
    clear_provider_secrets, read_state, record_session_audit, write_state, FactoryState,
};
use crate::types::{
    amount_to_string, parse_amount, EscrowClaim, FactoryError, PaymentStatus, RefundSpawnResponse,
    SessionAuditActor, SpawnSession, SpawnSessionState,
};

pub fn register_escrow_claim(session: &SpawnSession, now_ms: u64) -> EscrowClaim {
    let claim = EscrowClaim {
        session_id: session.session_id.clone(),
        quote_terms_hash: session.quote_terms_hash.clone(),
        payment_address: session.payment.payment_address.clone(),
        chain: session.chain.clone(),
        asset: session.asset.clone(),
        required_gross_amount: session.gross_amount.clone(),
        paid_amount: "0".to_string(),
        payment_status: PaymentStatus::Unpaid,
        refundable: false,
        refunded_at: None,
        created_at: now_ms,
        updated_at: now_ms,
    };

    write_state(|state| {
        state
            .escrow_claims
            .insert(session.session_id.clone(), claim.clone());
    });

    claim
}

pub fn get_escrow_claim(session_id: &str) -> Result<EscrowClaim, FactoryError> {
    read_state(|state| {
        state.escrow_claims.get(session_id).cloned().ok_or_else(|| {
            FactoryError::EscrowClaimNotFound {
                session_id: session_id.to_string(),
            }
        })
    })
}

pub fn record_escrow_payment(
    session_id: &str,
    quote_terms_hash: &str,
    paid_amount: &str,
    now_ms: u64,
) -> Result<EscrowClaim, FactoryError> {
    let paid_amount_value = parse_amount(paid_amount)?;

    write_state(|state| {
        let (expected_quote_terms_hash, required_gross_amount, expires_at, previous_state) =
            {
                let session = state.sessions.get(session_id).ok_or_else(|| {
                    FactoryError::SessionNotFound {
                        session_id: session_id.to_string(),
                    }
                })?;
                (
                    session.quote_terms_hash.clone(),
                    parse_amount(&session.gross_amount)?,
                    session.expires_at,
                    session.state.clone(),
                )
            };

        if expected_quote_terms_hash != quote_terms_hash {
            return Err(FactoryError::QuoteTermsHashMismatch {
                expected: expected_quote_terms_hash,
                received: quote_terms_hash.to_string(),
            });
        }

        if now_ms > expires_at {
            let _ = expire_session_in_state(
                state,
                session_id,
                SessionAuditActor::System,
                now_ms,
                "payment synchronized after expiration",
            )?;
            return Err(FactoryError::SessionExpired {
                session_id: session_id.to_string(),
                expires_at,
            });
        }

        let payment_status = if paid_amount_value >= required_gross_amount {
            PaymentStatus::Paid
        } else if paid_amount_value > 0 {
            PaymentStatus::Partial
        } else {
            PaymentStatus::Unpaid
        };

        {
            let claim = state.escrow_claims.get_mut(session_id).ok_or_else(|| {
                FactoryError::EscrowClaimNotFound {
                    session_id: session_id.to_string(),
                }
            })?;
            claim.paid_amount = amount_to_string(paid_amount_value);
            claim.payment_status = payment_status.clone();
            claim.refundable = false;
            claim.updated_at = now_ms;
        }

        let session =
            state
                .sessions
                .get_mut(session_id)
                .ok_or_else(|| FactoryError::SessionNotFound {
                    session_id: session_id.to_string(),
                })?;
        session.payment_status = payment_status.clone();
        session.refundable = false;
        session.updated_at = now_ms;

        let target_state = if paid_amount_value >= required_gross_amount {
            SpawnSessionState::PaymentDetected
        } else {
            SpawnSessionState::AwaitingPayment
        };

        if session.state != target_state {
            session.state = target_state.clone();
            record_session_audit(
                state,
                session_id,
                Some(previous_state),
                target_state,
                SessionAuditActor::Escrow,
                now_ms,
                "escrow payment synchronized",
            );
        }

        state.escrow_claims.get(session_id).cloned().ok_or_else(|| {
            FactoryError::EscrowClaimNotFound {
                session_id: session_id.to_string(),
            }
        })
    })
}

pub(crate) fn claim_escrow_refund_in_state(
    state: &mut FactoryState,
    session_id: &str,
    now_ms: u64,
) -> Result<RefundSpawnResponse, FactoryError> {
    let session =
        state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            })?;

    if session.payment_status == PaymentStatus::Refunded {
        let refunded_at = state
            .escrow_claims
            .get(session_id)
            .and_then(|claim| claim.refunded_at)
            .unwrap_or(now_ms);
        return Ok(RefundSpawnResponse {
            session_id: session_id.to_string(),
            state: session.state,
            payment_status: PaymentStatus::Refunded,
            refunded_at,
        });
    }

    if session.state != SpawnSessionState::Expired || !session.refundable {
        return Err(FactoryError::SessionNotRefundable {
            session_id: session_id.to_string(),
            state: session.state,
            payment_status: session.payment_status,
        });
    }

    let claim = state
        .escrow_claims
        .get(session_id)
        .cloned()
        .ok_or_else(|| FactoryError::EscrowClaimNotFound {
            session_id: session_id.to_string(),
        })?;
    if !claim.refundable {
        return Err(FactoryError::SessionNotRefundable {
            session_id: session_id.to_string(),
            state: session.state,
            payment_status: session.payment_status,
        });
    }

    if let Some(canister_id) = session.automaton_canister_id.as_ref() {
        let runtime = state.runtimes.get_mut(canister_id).ok_or_else(|| {
            FactoryError::AutomatonRuntimeNotFound {
                canister_id: canister_id.clone(),
            }
        })?;
        if runtime
            .controllers
            .iter()
            .any(|controller| controller == "factory")
        {
            complete_controller_handoff(runtime, "factory")?;
        }
        runtime.provider_keys_cleared = true;
    }

    {
        let session = state
            .sessions
            .get_mut(session_id)
            .expect("session existence checked");
        clear_provider_secrets(session, None);
        session.retryable = false;
        session.refundable = false;
        session.payment_status = PaymentStatus::Refunded;
        session.updated_at = now_ms;
    }

    {
        let claim = state
            .escrow_claims
            .get_mut(session_id)
            .expect("claim existence checked");
        claim.payment_status = PaymentStatus::Refunded;
        claim.refundable = false;
        claim.refunded_at = Some(now_ms);
        claim.updated_at = now_ms;
    }

    record_session_audit(
        state,
        session_id,
        Some(SpawnSessionState::Expired),
        SpawnSessionState::Expired,
        SessionAuditActor::Escrow,
        now_ms,
        "refund claimed after expiration",
    );

    Ok(RefundSpawnResponse {
        session_id: session_id.to_string(),
        state: SpawnSessionState::Expired,
        payment_status: PaymentStatus::Refunded,
        refunded_at: now_ms,
    })
}

pub fn claim_escrow_refund(
    session_id: &str,
    now_ms: u64,
) -> Result<RefundSpawnResponse, FactoryError> {
    write_state(|state| claim_escrow_refund_in_state(state, session_id, now_ms))
}
