use std::error::Error;
use std::fmt::{Display, Formatter};

pub const QUOTE_TERMS_HASH_FIELD: &str = "quoteTermsHash";
pub const EXPIRES_AT_FIELD: &str = "expiresAt";
pub const SESSION_ID_FIELD: &str = "sessionId";
pub const FUNDING_AUTOMATON_STATE: &str = "funding_automaton";
pub const CONTROLLER_FIELD: &str = "controller";

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpawnChain {
    Base,
}

impl SpawnChain {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Base => "base",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpawnAsset {
    Eth,
    Usdc,
}

impl SpawnAsset {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Eth => "eth",
            Self::Usdc => "usdc",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SpawnSessionState {
    AwaitingPayment,
    PaymentDetected,
    Spawning,
    FundingAutomaton,
    Complete,
    Failed,
    Expired,
}

impl SpawnSessionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::AwaitingPayment => "awaiting_payment",
            Self::PaymentDetected => "payment_detected",
            Self::Spawning => "spawning",
            Self::FundingAutomaton => FUNDING_AUTOMATON_STATE,
            Self::Complete => "complete",
            Self::Failed => "failed",
            Self::Expired => "expired",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Unpaid,
    Partial,
    Paid,
    Refunded,
}

impl PaymentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Unpaid => "unpaid",
            Self::Partial => "partial",
            Self::Paid => "paid",
            Self::Refunded => "refunded",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SessionAuditActor {
    System,
    User,
    Admin,
    Escrow,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProviderConfig {
    pub open_router_api_key: Option<String>,
    pub model: Option<String>,
    pub brave_search_api_key: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnConfig {
    pub chain: SpawnChain,
    pub risk: u8,
    pub strategies: Vec<String>,
    pub skills: Vec<String>,
    pub provider: ProviderConfig,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreateSpawnSessionRequest {
    pub steward_address: String,
    pub asset: SpawnAsset,
    pub gross_amount: String,
    pub config: SpawnConfig,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeConfig {
    pub eth_fee: String,
    pub usdc_fee: String,
    pub updated_at: u64,
}

impl FeeConfig {
    pub fn amount_for(&self, asset: &SpawnAsset) -> &str {
        match asset {
            SpawnAsset::Eth => &self.eth_fee,
            SpawnAsset::Usdc => &self.usdc_fee,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreationCostQuote {
    pub eth_cost: String,
    pub usdc_cost: String,
    pub updated_at: u64,
}

impl CreationCostQuote {
    pub fn amount_for(&self, asset: &SpawnAsset) -> &str {
        match asset {
            SpawnAsset::Eth => &self.eth_cost,
            SpawnAsset::Usdc => &self.usdc_cost,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnPaymentInstructions {
    pub session_id: String,
    pub chain: SpawnChain,
    pub asset: SpawnAsset,
    pub payment_address: String,
    pub gross_amount: String,
    pub quote_terms_hash: String,
    pub expires_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EscrowClaim {
    pub session_id: String,
    pub quote_terms_hash: String,
    pub payment_address: String,
    pub chain: SpawnChain,
    pub asset: SpawnAsset,
    pub required_gross_amount: String,
    pub paid_amount: String,
    pub payment_status: PaymentStatus,
    pub refundable: bool,
    pub refunded_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnQuote {
    pub session_id: String,
    pub chain: SpawnChain,
    pub asset: SpawnAsset,
    pub gross_amount: String,
    pub platform_fee: String,
    pub creation_cost: String,
    pub net_forward_amount: String,
    pub quote_terms_hash: String,
    pub expires_at: u64,
    pub payment: SpawnPaymentInstructions,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutomatonRuntimeState {
    pub canister_id: String,
    pub evm_address: String,
    pub steward_address: String,
    pub session_id: String,
    pub initialized_at: u64,
    pub funded_amount: String,
    pub last_funded_at: Option<u64>,
    pub controllers: Vec<String>,
    pub chain: SpawnChain,
    pub risk: u8,
    pub strategies: Vec<String>,
    pub skills: Vec<String>,
    pub model: Option<String>,
    pub provider_keys_cleared: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnSession {
    pub session_id: String,
    pub steward_address: String,
    pub chain: SpawnChain,
    pub asset: SpawnAsset,
    pub gross_amount: String,
    pub platform_fee: String,
    pub creation_cost: String,
    pub net_forward_amount: String,
    pub quote_terms_hash: String,
    pub expires_at: u64,
    pub state: SpawnSessionState,
    pub retryable: bool,
    pub refundable: bool,
    pub payment_status: PaymentStatus,
    pub automaton_canister_id: Option<String>,
    pub automaton_evm_address: Option<String>,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub config: SpawnConfig,
    pub created_at: u64,
    pub updated_at: u64,
    pub payment: SpawnPaymentInstructions,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CreateSpawnSessionResponse {
    pub session: SpawnSession,
    pub quote: SpawnQuote,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnExecutionReceipt {
    pub session_id: String,
    pub automaton_canister_id: String,
    pub automaton_evm_address: String,
    pub funded_amount: String,
    pub controller: String,
    pub completed_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionAuditEntry {
    pub session_id: String,
    pub timestamp: u64,
    pub from_state: Option<SpawnSessionState>,
    pub to_state: SpawnSessionState,
    pub actor: SessionAuditActor,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnSessionStatusResponse {
    pub session: SpawnSession,
    pub audit: Vec<SessionAuditEntry>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RefundSpawnResponse {
    pub session_id: String,
    pub state: SpawnSessionState,
    pub payment_status: PaymentStatus,
    pub refunded_at: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnedAutomatonRecord {
    pub canister_id: String,
    pub steward_address: String,
    pub evm_address: String,
    pub chain: SpawnChain,
    pub session_id: String,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub created_at: u64,
    pub version_commit: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SpawnedAutomatonRegistryPage {
    pub items: Vec<SpawnedAutomatonRecord>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FactoryConfigSnapshot {
    pub fee_config: FeeConfig,
    pub creation_cost_quote: CreationCostQuote,
    pub pause: bool,
    pub payment_address: String,
    pub session_ttl_ms: u64,
    pub version_commit: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionAdminView {
    pub session: SpawnSession,
    pub audit: Vec<SessionAuditEntry>,
    pub quote: SpawnQuote,
    pub escrow_claim: EscrowClaim,
    pub registry_record: Option<SpawnedAutomatonRecord>,
    pub pause: bool,
    pub quoted_total_amount: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FactoryError {
    FactoryPaused {
        pause: bool,
    },
    InvalidAmount {
        value: String,
    },
    GrossBelowRequiredMinimum {
        provided: String,
        required: String,
    },
    SessionNotFound {
        session_id: String,
    },
    EscrowClaimNotFound {
        session_id: String,
    },
    RegistryRecordNotFound {
        canister_id: String,
    },
    UnauthorizedAdmin {
        caller: String,
    },
    UnauthorizedSteward {
        caller: String,
        session_id: String,
    },
    InvalidPaginationLimit {
        limit: usize,
    },
    QuoteTermsHashMismatch {
        expected: String,
        received: String,
    },
    PaymentNotSettled {
        session_id: String,
        status: PaymentStatus,
    },
    SessionExpired {
        session_id: String,
        expires_at: u64,
    },
    SessionNotRetryable {
        session_id: String,
        state: SpawnSessionState,
    },
    SessionNotRefundable {
        session_id: String,
        state: SpawnSessionState,
        payment_status: PaymentStatus,
    },
    SessionNotReadyForSpawn {
        session_id: String,
        state: SpawnSessionState,
    },
    ControllerInvariantViolation {
        canister_id: String,
    },
    AutomatonRuntimeNotFound {
        canister_id: String,
    },
}

impl Display for FactoryError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::FactoryPaused { pause } => {
                write!(f, "factory is paused: pause={pause}")
            }
            Self::InvalidAmount { value } => write!(f, "invalid amount: {value}"),
            Self::GrossBelowRequiredMinimum { provided, required } => {
                write!(
                    f,
                    "gross amount below required minimum: provided={provided}, required={required}"
                )
            }
            Self::SessionNotFound { session_id } => write!(f, "session not found: {session_id}"),
            Self::EscrowClaimNotFound { session_id } => {
                write!(f, "escrow claim not found: {session_id}")
            }
            Self::RegistryRecordNotFound { canister_id } => {
                write!(f, "registry record not found: {canister_id}")
            }
            Self::UnauthorizedAdmin { caller } => {
                write!(f, "caller is not an admin: {caller}")
            }
            Self::UnauthorizedSteward { caller, session_id } => {
                write!(
                    f,
                    "caller is not the steward for session {session_id}: {caller}"
                )
            }
            Self::InvalidPaginationLimit { limit } => {
                write!(f, "pagination limit must be positive: {limit}")
            }
            Self::QuoteTermsHashMismatch { expected, received } => {
                write!(
                    f,
                    "quote terms hash mismatch: expected={expected}, received={received}"
                )
            }
            Self::PaymentNotSettled { session_id, status } => {
                write!(
                    f,
                    "payment not settled for session {session_id}: status={}",
                    status.as_str()
                )
            }
            Self::SessionExpired {
                session_id,
                expires_at,
            } => {
                write!(f, "session expired: {session_id} at {expires_at}")
            }
            Self::SessionNotRetryable { session_id, state } => {
                write!(
                    f,
                    "session not retryable: {session_id} state={}",
                    state.as_str()
                )
            }
            Self::SessionNotRefundable {
                session_id,
                state,
                payment_status,
            } => {
                write!(
                    f,
                    "session not refundable: {session_id} state={} payment_status={}",
                    state.as_str(),
                    payment_status.as_str()
                )
            }
            Self::SessionNotReadyForSpawn { session_id, state } => {
                write!(
                    f,
                    "session not ready for spawn: {session_id} state={}",
                    state.as_str()
                )
            }
            Self::ControllerInvariantViolation { canister_id } => {
                write!(f, "controller invariant violation for {canister_id}")
            }
            Self::AutomatonRuntimeNotFound { canister_id } => {
                write!(f, "automaton runtime not found: {canister_id}")
            }
        }
    }
}

impl Error for FactoryError {}

pub fn parse_amount(value: &str) -> Result<u128, FactoryError> {
    value
        .parse::<u128>()
        .map_err(|_| FactoryError::InvalidAmount {
            value: value.to_string(),
        })
}

pub fn amount_to_string(value: u128) -> String {
    value.to_string()
}

pub fn hash_quote_terms(parts: &[&str]) -> String {
    const OFFSET_BASIS: u64 = 14_695_981_039_346_656_037;
    const FNV_PRIME: u64 = 1_099_511_628_211;

    let mut hash = OFFSET_BASIS;
    for part in parts {
        for byte in part.as_bytes() {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(FNV_PRIME);
        }
        hash ^= 0xff;
        hash = hash.wrapping_mul(FNV_PRIME);
    }

    format!("{hash:016x}")
}
