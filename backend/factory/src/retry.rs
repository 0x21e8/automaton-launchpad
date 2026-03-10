use crate::state::{record_session_audit, write_state, FactoryState};
use crate::types::{
    FactoryError, PaymentStatus, SessionAuditActor, SpawnSession, SpawnSessionState,
};

fn retryable_payment_status(payment_status: &PaymentStatus) -> bool {
    *payment_status == PaymentStatus::Paid
}

pub(crate) fn mark_session_failed_in_state(
    state: &mut FactoryState,
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    let session =
        state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            })?;
    let retryable =
        retryable_payment_status(&session.payment_status) && now_ms <= session.expires_at;

    {
        let session = state
            .sessions
            .get_mut(session_id)
            .expect("session existence checked");
        session.state = SpawnSessionState::Failed;
        session.retryable = retryable;
        session.refundable = false;
        session.updated_at = now_ms;
    }

    if let Some(claim) = state.escrow_claims.get_mut(session_id) {
        claim.refundable = false;
        claim.updated_at = now_ms;
    }

    record_session_audit(
        state,
        session_id,
        Some(session.state),
        SpawnSessionState::Failed,
        actor,
        now_ms,
        reason,
    );

    Ok(state
        .sessions
        .get(session_id)
        .cloned()
        .expect("failed session should remain stored"))
}

pub(crate) fn retry_spawn_session_in_state(
    state: &mut FactoryState,
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    let session =
        state
            .sessions
            .get(session_id)
            .cloned()
            .ok_or_else(|| FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            })?;

    if now_ms > session.expires_at {
        return Err(FactoryError::SessionExpired {
            session_id: session_id.to_string(),
            expires_at: session.expires_at,
        });
    }

    if session.state != SpawnSessionState::Failed || !session.retryable {
        return Err(FactoryError::SessionNotRetryable {
            session_id: session_id.to_string(),
            state: session.state,
        });
    }

    if !retryable_payment_status(&session.payment_status) {
        return Err(FactoryError::SessionNotRetryable {
            session_id: session_id.to_string(),
            state: session.state,
        });
    }

    {
        let session = state
            .sessions
            .get_mut(session_id)
            .expect("session existence checked");
        session.state = SpawnSessionState::PaymentDetected;
        session.retryable = false;
        session.refundable = false;
        session.updated_at = now_ms;
    }

    if let Some(claim) = state.escrow_claims.get_mut(session_id) {
        claim.refundable = false;
        claim.updated_at = now_ms;
    }

    record_session_audit(
        state,
        session_id,
        Some(SpawnSessionState::Failed),
        SpawnSessionState::PaymentDetected,
        actor,
        now_ms,
        reason,
    );

    Ok(state
        .sessions
        .get(session_id)
        .cloned()
        .expect("retried session should remain stored"))
}

pub fn mark_session_failed(
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    write_state(|state| mark_session_failed_in_state(state, session_id, actor, now_ms, reason))
}

pub fn retry_failed_session(
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    write_state(|state| retry_spawn_session_in_state(state, session_id, actor, now_ms, reason))
}
