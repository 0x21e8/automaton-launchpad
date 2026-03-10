use crate::api::public::get_spawn_session;
use crate::expiry::expire_spawn_session;
use crate::retry::retry_failed_session;
use crate::state::{read_state, write_state};
use crate::types::{
    amount_to_string, parse_amount, CreationCostQuote, FactoryConfigSnapshot, FactoryError,
    FeeConfig, SessionAdminView, SessionAuditActor, SessionAuditEntry, SpawnQuote,
    SpawnSessionStatusResponse, SpawnedAutomatonRecord,
};

fn ensure_admin(caller: &str) -> Result<(), FactoryError> {
    let is_admin = read_state(|state| state.admin_principals.contains(caller));
    if is_admin {
        return Ok(());
    }

    Err(FactoryError::UnauthorizedAdmin {
        caller: caller.to_string(),
    })
}

pub fn set_fee_config(
    caller: &str,
    mut config: FeeConfig,
    now_ms: u64,
) -> Result<FeeConfig, FactoryError> {
    ensure_admin(caller)?;
    parse_amount(&config.eth_fee)?;
    parse_amount(&config.usdc_fee)?;
    config.updated_at = now_ms;

    write_state(|state| {
        state.fee_config = config.clone();
    });

    Ok(config)
}

pub fn set_creation_cost_quote(
    caller: &str,
    mut config: CreationCostQuote,
    now_ms: u64,
) -> Result<CreationCostQuote, FactoryError> {
    ensure_admin(caller)?;
    parse_amount(&config.eth_cost)?;
    parse_amount(&config.usdc_cost)?;
    config.updated_at = now_ms;

    write_state(|state| {
        state.creation_cost_quote = config.clone();
    });

    Ok(config)
}

pub fn set_pause(caller: &str, paused: bool) -> Result<bool, FactoryError> {
    ensure_admin(caller)?;
    write_state(|state| {
        state.paused = paused;
    });
    Ok(paused)
}

pub fn get_factory_config(caller: &str) -> Result<FactoryConfigSnapshot, FactoryError> {
    ensure_admin(caller)?;
    Ok(read_state(|state| FactoryConfigSnapshot {
        fee_config: state.fee_config.clone(),
        creation_cost_quote: state.creation_cost_quote.clone(),
        pause: state.paused,
        payment_address: state.payment_address.clone(),
        session_ttl_ms: state.session_ttl_ms,
        version_commit: state.version_commit.clone(),
    }))
}

pub fn get_session_admin(caller: &str, session_id: &str) -> Result<SessionAdminView, FactoryError> {
    ensure_admin(caller)?;

    read_state(|state| {
        let session = state.sessions.get(session_id).cloned().ok_or_else(|| {
            FactoryError::SessionNotFound {
                session_id: session_id.to_string(),
            }
        })?;
        let audit: Vec<SessionAuditEntry> =
            state.audit_log.get(session_id).cloned().unwrap_or_default();
        let quoted_total_amount = amount_to_string(
            parse_amount(state.fee_config.amount_for(&session.asset))?
                + parse_amount(state.creation_cost_quote.amount_for(&session.asset))?,
        );
        let quote = SpawnQuote {
            session_id: session.session_id.clone(),
            chain: session.chain.clone(),
            asset: session.asset.clone(),
            gross_amount: session.gross_amount.clone(),
            platform_fee: session.platform_fee.clone(),
            creation_cost: session.creation_cost.clone(),
            net_forward_amount: session.net_forward_amount.clone(),
            quote_terms_hash: session.quote_terms_hash.clone(),
            expires_at: session.expires_at,
            payment: session.payment.clone(),
        };
        let escrow_claim = state
            .escrow_claims
            .get(session_id)
            .cloned()
            .ok_or_else(|| FactoryError::EscrowClaimNotFound {
                session_id: session_id.to_string(),
            })?;
        let registry_record: Option<SpawnedAutomatonRecord> = session
            .automaton_canister_id
            .as_ref()
            .and_then(|canister_id| state.registry.get(canister_id).cloned());

        Ok(SessionAdminView {
            session,
            audit,
            quote,
            escrow_claim,
            registry_record,
            pause: state.paused,
            quoted_total_amount,
        })
    })
}

pub fn retry_session_admin(
    caller: &str,
    session_id: &str,
    now_ms: u64,
) -> Result<SpawnSessionStatusResponse, FactoryError> {
    ensure_admin(caller)?;
    let _ = expire_spawn_session(session_id, now_ms)?;
    retry_failed_session(
        session_id,
        SessionAuditActor::Admin,
        now_ms,
        "retry requested by admin",
    )?;
    get_spawn_session(session_id)
}
