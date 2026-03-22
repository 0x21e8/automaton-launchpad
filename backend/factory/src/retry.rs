use crate::scheduler::enqueue_spawn_execution_in_state;
use crate::session_transitions::{apply_session_event_in_state, SpawnSessionEvent};
use crate::state::{write_state, FactoryState};
use crate::types::{FactoryError, SessionAuditActor, SpawnSession};

pub(crate) fn mark_session_failed_in_state(
    state: &mut FactoryState,
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    let session = apply_session_event_in_state(
        state,
        session_id,
        actor,
        now_ms,
        SpawnSessionEvent::SpawnFailed,
        reason,
    )?;

    if session.retryable {
        enqueue_spawn_execution_in_state(state, session_id, now_ms);
    }

    Ok(session)
}

pub(crate) fn retry_spawn_session_in_state(
    state: &mut FactoryState,
    session_id: &str,
    actor: SessionAuditActor,
    now_ms: u64,
    reason: &str,
) -> Result<SpawnSession, FactoryError> {
    let session = apply_session_event_in_state(
        state,
        session_id,
        actor,
        now_ms,
        SpawnSessionEvent::RetryRequested,
        reason,
    )?;

    enqueue_spawn_execution_in_state(state, session_id, now_ms);

    Ok(session)
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
