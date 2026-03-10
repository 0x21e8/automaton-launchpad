use crate::state::{record_session_audit, write_state, FactoryState};
use crate::types::{
    FactoryError, PaymentStatus, SessionAuditActor, SpawnSession, SpawnSessionState,
};

fn session_is_terminal(state: &SpawnSessionState, payment_status: &PaymentStatus) -> bool {
    matches!(
        state,
        SpawnSessionState::Complete | SpawnSessionState::Expired
    ) || *payment_status == PaymentStatus::Refunded
}

fn is_refundable_payment_status(payment_status: &PaymentStatus) -> bool {
    matches!(payment_status, PaymentStatus::Partial | PaymentStatus::Paid)
}

pub(crate) fn expire_session_in_state(
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

    if session_is_terminal(&session.state, &session.payment_status) || now_ms <= session.expires_at
    {
        return Ok(session);
    }

    let refundable = is_refundable_payment_status(&session.payment_status);

    {
        let session = state
            .sessions
            .get_mut(session_id)
            .expect("session existence checked");
        session.state = SpawnSessionState::Expired;
        session.retryable = false;
        session.refundable = refundable;
        session.updated_at = now_ms;
    }

    if let Some(claim) = state.escrow_claims.get_mut(session_id) {
        claim.refundable = refundable;
        claim.updated_at = now_ms;
    }

    record_session_audit(
        state,
        session_id,
        Some(session.state),
        SpawnSessionState::Expired,
        actor,
        now_ms,
        reason,
    );

    Ok(state
        .sessions
        .get(session_id)
        .cloned()
        .expect("expired session should remain stored"))
}

pub fn expire_spawn_session(session_id: &str, now_ms: u64) -> Result<SpawnSession, FactoryError> {
    write_state(|state| {
        expire_session_in_state(
            state,
            session_id,
            SessionAuditActor::System,
            now_ms,
            "session expired",
        )
    })
}
