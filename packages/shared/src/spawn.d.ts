export declare const SUPPORTED_SPAWN_CHAINS: readonly ["base"];
export declare const SUPPORTED_SPAWN_ASSETS: readonly ["eth", "usdc"];
export declare const SPAWN_SESSION_STATES: readonly ["awaiting_payment", "payment_detected", "spawning", "funding_automaton", "complete", "failed", "expired"];
export declare const PAYMENT_STATUSES: readonly ["unpaid", "partial", "paid", "refunded"];
export declare const SESSION_AUDIT_ACTORS: readonly ["system", "user", "admin", "escrow"];
export declare const MINIMUM_GROSS_PAYMENT_USD = 50;
export type SpawnChain = (typeof SUPPORTED_SPAWN_CHAINS)[number];
export type SpawnAsset = (typeof SUPPORTED_SPAWN_ASSETS)[number];
export type SpawnSessionState = (typeof SPAWN_SESSION_STATES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SessionAuditActor = (typeof SESSION_AUDIT_ACTORS)[number];
export interface ProviderConfig {
    openRouterApiKey: string | null;
    model: string | null;
    braveSearchApiKey: string | null;
}
export interface SpawnConfig extends ProviderConfig {
    chain: SpawnChain;
    risk: number;
    strategies: string[];
    skills: string[];
}
export interface SpawnPaymentInstructions {
    sessionId: string;
    chain: SpawnChain;
    asset: SpawnAsset;
    paymentAddress: string;
    grossAmount: string;
    quoteTermsHash: string;
    expiresAt: number;
}
export interface SpawnQuote {
    sessionId: string;
    chain: SpawnChain;
    asset: SpawnAsset;
    grossAmount: string;
    platformFee: string;
    creationCost: string;
    netForwardAmount: string;
    quoteTermsHash: string;
    expiresAt: number;
    payment: SpawnPaymentInstructions;
}
export interface SpawnSession {
    sessionId: string;
    stewardAddress: string;
    chain: SpawnChain;
    asset: SpawnAsset;
    grossAmount: string;
    platformFee: string;
    creationCost: string;
    netForwardAmount: string;
    quoteTermsHash: string;
    expiresAt: number;
    state: SpawnSessionState;
    retryable: boolean;
    refundable: boolean;
    paymentStatus: PaymentStatus;
    automatonCanisterId: string | null;
    automatonEvmAddress: string | null;
    parentId: string | null;
    childIds: string[];
    config: SpawnConfig;
    createdAt: number;
    updatedAt: number;
}
export interface CreateSpawnSessionRequest {
    stewardAddress: string;
    asset: SpawnAsset;
    grossAmount: string;
    config: SpawnConfig;
    parentId?: string | null;
}
export interface CreateSpawnSessionResponse {
    session: SpawnSession;
    quote: SpawnQuote;
}
export interface RetrySpawnRequest {
    sessionId: string;
}
export interface RetrySpawnResponse {
    session: SpawnSession;
}
export interface RefundSpawnRequest {
    sessionId: string;
}
export interface RefundSpawnResponse {
    sessionId: string;
    state: SpawnSessionState;
    paymentStatus: PaymentStatus;
    refundedAt: number;
}
export interface SessionAuditEntry {
    sessionId: string;
    timestamp: number;
    fromState: SpawnSessionState | null;
    toState: SpawnSessionState;
    actor: SessionAuditActor;
    reason: string;
}
export interface SpawnSessionStatusResponse {
    session: SpawnSession;
    audit: SessionAuditEntry[];
}
export interface EscrowPaymentRecord {
    sessionId: string;
    quoteTermsHash: string;
    paymentAddress: string;
    chain: SpawnChain;
    asset: SpawnAsset;
    requiredGrossAmount: string;
    paidAmount: string;
    paymentStatus: PaymentStatus;
    refundable: boolean;
    refundedAt: number | null;
    createdAt: number;
    updatedAt: number;
}
export interface SpawnedAutomatonRecord {
    canisterId: string;
    stewardAddress: string;
    evmAddress: string;
    chain: SpawnChain;
    sessionId: string;
    parentId: string | null;
    childIds: string[];
    createdAt: number;
    versionCommit: string;
}
export interface SpawnedAutomatonRegistryPage {
    items: SpawnedAutomatonRecord[];
    nextCursor: string | null;
}
export interface SpawnSessionDetail extends SpawnSessionStatusResponse {
    escrow: EscrowPaymentRecord | null;
    registryRecord: SpawnedAutomatonRecord | null;
}
//# sourceMappingURL=spawn.d.ts.map