mod api;
pub mod controllers;
pub mod escrow;
pub mod expiry;
pub mod init;
pub mod retry;
pub mod spawn;
pub mod state;
pub mod types;

pub use api::admin::{
    get_factory_config, get_session_admin, retry_session_admin, set_creation_cost_quote,
    set_fee_config, set_pause,
};
pub use api::public::{
    claim_spawn_refund, create_spawn_session, get_spawn_session, get_spawned_automaton,
    list_spawned_automatons, retry_spawn_session,
};
pub use escrow::{
    claim_escrow_refund, get_escrow_claim, record_escrow_payment, register_escrow_claim,
};
pub use expiry::expire_spawn_session;
pub use retry::{mark_session_failed, retry_failed_session};
pub use spawn::execute_spawn;
pub use state::{
    clear_provider_secrets, insert_spawned_automaton_record, read_state, restore_state,
    snapshot_state, write_state, FactoryStateSnapshot,
};
pub use types::{
    AutomatonRuntimeState, CreateSpawnSessionRequest, CreateSpawnSessionResponse,
    CreationCostQuote, EscrowClaim, FactoryConfigSnapshot, FactoryError, FeeConfig, PaymentStatus,
    ProviderConfig, RefundSpawnResponse, SessionAdminView, SessionAuditActor, SessionAuditEntry,
    SpawnAsset, SpawnChain, SpawnConfig, SpawnExecutionReceipt, SpawnPaymentInstructions,
    SpawnQuote, SpawnSession, SpawnSessionState, SpawnSessionStatusResponse,
    SpawnedAutomatonRecord, SpawnedAutomatonRegistryPage,
};

pub const FACTORY_CANISTER_NAME: &str = "factory";

pub fn bootstrap_status() -> &'static str {
    "factory-session-core-ready"
}

#[cfg(test)]
mod tests {
    use super::{
        bootstrap_status, claim_spawn_refund, create_spawn_session, execute_spawn,
        expire_spawn_session, get_escrow_claim, get_factory_config, get_session_admin,
        get_spawn_session, get_spawned_automaton, insert_spawned_automaton_record,
        list_spawned_automatons, mark_session_failed, record_escrow_payment, restore_state,
        retry_session_admin, retry_spawn_session, set_creation_cost_quote, set_fee_config,
        set_pause, snapshot_state, CreateSpawnSessionRequest, CreationCostQuote, FeeConfig,
        PaymentStatus, ProviderConfig, SessionAuditActor, SpawnAsset, SpawnChain, SpawnConfig,
        SpawnSessionState, SpawnedAutomatonRecord, FACTORY_CANISTER_NAME,
    };

    fn reset_factory_state() {
        restore_state(Default::default());
    }

    fn sample_request(gross_amount: &str) -> CreateSpawnSessionRequest {
        CreateSpawnSessionRequest {
            steward_address: "0xsteward".to_string(),
            asset: SpawnAsset::Eth,
            gross_amount: gross_amount.to_string(),
            config: SpawnConfig {
                chain: SpawnChain::Base,
                risk: 7,
                strategies: vec!["trend".to_string()],
                skills: vec!["search".to_string()],
                provider: ProviderConfig {
                    open_router_api_key: Some("or-key".to_string()),
                    model: Some("openrouter/auto".to_string()),
                    brave_search_api_key: Some("brave-key".to_string()),
                },
            },
            parent_id: None,
        }
    }

    #[test]
    fn exposes_bootstrap_identity() {
        assert_eq!(FACTORY_CANISTER_NAME, "factory");
        assert_eq!(bootstrap_status(), "factory-session-core-ready");
    }

    #[test]
    fn creates_sessions_with_fixed_quote_terms_and_audit_log() {
        reset_factory_state();

        let before = snapshot_state();
        let response = create_spawn_session(sample_request("20000000000000000"), 1_700_000)
            .expect("session should be created");

        assert_eq!(response.session.state, SpawnSessionState::AwaitingPayment);
        assert_eq!(
            response.session.quote_terms_hash,
            response.quote.quote_terms_hash
        );
        assert_eq!(response.session.expires_at, response.quote.expires_at);
        assert_eq!(
            response.quote.payment.quote_terms_hash,
            response.quote.quote_terms_hash
        );
        assert_eq!(response.session.net_forward_amount, "0");

        let status = get_spawn_session(&response.session.session_id).expect("session should load");
        assert_eq!(status.audit.len(), 1);
        assert_eq!(status.audit[0].from_state, None);
        assert_eq!(status.audit[0].to_state, SpawnSessionState::AwaitingPayment);
        assert_eq!(status.audit[0].reason, "session created");

        let after = snapshot_state();
        assert_eq!(before.sessions.len() + 1, after.sessions.len());
    }

    #[test]
    fn rejects_session_creation_while_paused() {
        reset_factory_state();

        set_pause("admin", true).expect("admin can pause");
        let error = create_spawn_session(sample_request("20000000000000000"), 1_700_000)
            .expect_err("paused factory should reject sessions");

        assert!(matches!(
            error,
            super::FactoryError::FactoryPaused { pause: true }
        ));
    }

    #[test]
    fn updates_admin_quote_configuration() {
        reset_factory_state();

        let fee_config = set_fee_config(
            "admin",
            FeeConfig {
                eth_fee: "3000000000000000".to_string(),
                usdc_fee: "7000000".to_string(),
                updated_at: 0,
            },
            50,
        )
        .expect("fee config should update");

        let creation_cost = set_creation_cost_quote(
            "admin",
            CreationCostQuote {
                eth_cost: "25000000000000000".to_string(),
                usdc_cost: "43000000".to_string(),
                updated_at: 0,
            },
            60,
        )
        .expect("creation cost should update");

        let factory_config = get_factory_config("admin").expect("admin can read config");
        assert_eq!(fee_config.updated_at, 50);
        assert_eq!(creation_cost.updated_at, 60);
        assert_eq!(factory_config.fee_config.eth_fee, "3000000000000000");
        assert_eq!(factory_config.creation_cost_quote.usdc_cost, "43000000");
    }

    #[test]
    fn paginates_registry_reads() {
        reset_factory_state();

        insert_spawned_automaton_record(SpawnedAutomatonRecord {
            canister_id: "aaaaa-aa".to_string(),
            steward_address: "0xone".to_string(),
            evm_address: "0xe1".to_string(),
            chain: SpawnChain::Base,
            session_id: "session-1".to_string(),
            parent_id: None,
            child_ids: Vec::new(),
            created_at: 1,
            version_commit: "dev-build".to_string(),
        });
        insert_spawned_automaton_record(SpawnedAutomatonRecord {
            canister_id: "bbbbb-bb".to_string(),
            steward_address: "0xtwo".to_string(),
            evm_address: "0xe2".to_string(),
            chain: SpawnChain::Base,
            session_id: "session-2".to_string(),
            parent_id: Some("aaaaa-aa".to_string()),
            child_ids: Vec::new(),
            created_at: 2,
            version_commit: "dev-build".to_string(),
        });

        let first_page = list_spawned_automatons(None, 1).expect("first page should load");
        assert_eq!(first_page.items.len(), 1);
        assert_eq!(first_page.next_cursor.as_deref(), Some("aaaaa-aa"));

        let second_page = list_spawned_automatons(first_page.next_cursor.as_deref(), 10)
            .expect("second page should load");
        assert_eq!(second_page.items.len(), 1);
        assert_eq!(second_page.items[0].canister_id, "bbbbb-bb");

        let record = get_spawned_automaton("bbbbb-bb").expect("single registry record should load");
        assert_eq!(record.parent_id.as_deref(), Some("aaaaa-aa"));
    }

    #[test]
    fn snapshots_and_restores_upgrade_safe_state() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("25000000000000000"), 5_000)
            .expect("session should be created");
        let snapshot = snapshot_state();

        reset_factory_state();
        restore_state(snapshot.clone());

        let session = get_spawn_session(&response.session.session_id).expect("session should load");
        let admin_view =
            get_session_admin("admin", &response.session.session_id).expect("admin read works");

        assert_eq!(session.session.session_id, response.session.session_id);
        assert_eq!(admin_view.quote.gross_amount, "25000000000000000");
        assert_eq!(
            admin_view.escrow_claim.required_gross_amount,
            "25000000000000000"
        );
        assert_eq!(snapshot.sessions.len(), 1);
    }

    #[test]
    fn keeps_underfunded_claims_awaiting_payment() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("20000000000000000"), 7_000)
            .expect("session should be created");
        let claim = record_escrow_payment(
            &response.session.session_id,
            &response.session.quote_terms_hash,
            "19000000000000000",
            8_000,
        )
        .expect("underfunded claim should sync");
        let session = get_spawn_session(&response.session.session_id).expect("session should load");

        assert_eq!(claim.payment_status, PaymentStatus::Partial);
        assert_eq!(session.session.state, SpawnSessionState::AwaitingPayment);
        assert_eq!(session.session.payment_status, PaymentStatus::Partial);
    }

    #[test]
    fn executes_spawn_after_paid_claim_and_hands_off_controller() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("25000000000000000"), 9_000)
            .expect("session should be created");
        let claim = get_escrow_claim(&response.session.session_id).expect("claim should exist");
        assert_eq!(claim.quote_terms_hash, response.session.quote_terms_hash);

        record_escrow_payment(
            &response.session.session_id,
            &response.session.quote_terms_hash,
            "25000000000000000",
            10_000,
        )
        .expect("claim should become paid");
        let receipt =
            execute_spawn(&response.session.session_id, 11_000).expect("spawn should complete");
        let session = get_spawn_session(&response.session.session_id).expect("session should load");
        let admin_view =
            get_session_admin("admin", &response.session.session_id).expect("admin read works");
        let runtime = snapshot_state()
            .runtimes
            .get(&receipt.automaton_canister_id)
            .cloned()
            .expect("runtime should exist");

        assert_eq!(session.session.state, SpawnSessionState::Complete);
        assert_eq!(session.session.payment_status, PaymentStatus::Paid);
        assert_eq!(receipt.funded_amount, "5000000000000000");
        assert_eq!(
            runtime.controllers,
            vec![receipt.automaton_canister_id.clone()]
        );
        assert!(runtime.provider_keys_cleared);
        assert_eq!(session.session.config.provider.open_router_api_key, None);
        assert_eq!(session.session.config.provider.brave_search_api_key, None);
        assert_eq!(
            admin_view
                .registry_record
                .expect("registry record should exist")
                .evm_address,
            receipt.automaton_evm_address
        );
    }

    #[test]
    fn retries_paid_failed_sessions_for_steward_and_admin() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("25000000000000000"), 12_000)
            .expect("session should be created");
        record_escrow_payment(
            &response.session.session_id,
            &response.session.quote_terms_hash,
            "25000000000000000",
            13_000,
        )
        .expect("claim should become paid");

        mark_session_failed(
            &response.session.session_id,
            SessionAuditActor::System,
            14_000,
            "provider initialization failed",
        )
        .expect("failure should be recorded");
        let failed = get_spawn_session(&response.session.session_id).expect("session should load");
        assert_eq!(failed.session.state, SpawnSessionState::Failed);
        assert!(failed.session.retryable);
        assert_eq!(
            failed
                .session
                .config
                .provider
                .open_router_api_key
                .as_deref(),
            Some("or-key")
        );
        assert_eq!(
            failed
                .session
                .config
                .provider
                .brave_search_api_key
                .as_deref(),
            Some("brave-key")
        );

        let retried = retry_spawn_session("0xsteward", &response.session.session_id, 15_000)
            .expect("steward retry should succeed");
        assert_eq!(retried.session.state, SpawnSessionState::PaymentDetected);
        assert!(!retried.session.retryable);

        mark_session_failed(
            &response.session.session_id,
            SessionAuditActor::System,
            16_000,
            "funding transfer failed",
        )
        .expect("second failure should be recorded");
        let admin_retry = retry_session_admin("admin", &response.session.session_id, 17_000)
            .expect("admin retry should succeed");
        assert_eq!(
            admin_retry.session.state,
            SpawnSessionState::PaymentDetected
        );
        assert_eq!(
            admin_retry
                .audit
                .last()
                .expect("retry audit should exist")
                .actor,
            SessionAuditActor::Admin
        );
    }

    #[test]
    fn expires_underfunded_sessions_and_allows_refund() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("20000000000000000"), 20_000)
            .expect("session should be created");
        record_escrow_payment(
            &response.session.session_id,
            &response.session.quote_terms_hash,
            "19000000000000000",
            21_000,
        )
        .expect("underfunded claim should sync");

        let expired =
            expire_spawn_session(&response.session.session_id, 20_000 + 30 * 60 * 1_000 + 1)
                .expect("session should expire");
        assert_eq!(expired.state, SpawnSessionState::Expired);
        assert!(expired.refundable);

        let refund = claim_spawn_refund(
            "0xsteward",
            &response.session.session_id,
            20_000 + 30 * 60 * 1_000 + 2,
        )
        .expect("refund should succeed");
        assert_eq!(refund.state, SpawnSessionState::Expired);
        assert_eq!(refund.payment_status, PaymentStatus::Refunded);

        let refunded =
            get_spawn_session(&response.session.session_id).expect("session should load");
        assert_eq!(refunded.session.payment_status, PaymentStatus::Refunded);
        assert_eq!(refunded.session.config.provider.open_router_api_key, None);
        assert_eq!(refunded.session.config.provider.brave_search_api_key, None);
        assert_eq!(
            refunded
                .audit
                .last()
                .expect("refund audit should exist")
                .reason,
            "refund claimed after expiration"
        );
    }

    #[test]
    fn expires_failed_paid_sessions_and_disables_retry_after_deadline() {
        reset_factory_state();

        let response = create_spawn_session(sample_request("25000000000000000"), 30_000)
            .expect("session should be created");
        record_escrow_payment(
            &response.session.session_id,
            &response.session.quote_terms_hash,
            "25000000000000000",
            31_000,
        )
        .expect("claim should become paid");
        mark_session_failed(
            &response.session.session_id,
            SessionAuditActor::System,
            32_000,
            "controller handoff failed",
        )
        .expect("failure should be recorded");

        let retry_error = retry_spawn_session(
            "0xsteward",
            &response.session.session_id,
            30_000 + 30 * 60 * 1_000 + 5,
        )
        .expect_err("expired session should not retry");
        assert!(matches!(
            retry_error,
            super::FactoryError::SessionExpired { .. }
        ));

        let expired = get_spawn_session(&response.session.session_id).expect("session should load");
        assert_eq!(expired.session.state, SpawnSessionState::Expired);
        assert!(expired.session.refundable);
    }
}
