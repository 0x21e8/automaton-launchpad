export const SUPPORTED_SPAWN_CHAINS = ["base"];
export const SUPPORTED_SPAWN_ASSETS = ["eth", "usdc"];
export const SPAWN_SESSION_STATES = [
    "awaiting_payment",
    "payment_detected",
    "spawning",
    "funding_automaton",
    "complete",
    "failed",
    "expired"
];
export const PAYMENT_STATUSES = [
    "unpaid",
    "partial",
    "paid",
    "refunded"
];
export const SESSION_AUDIT_ACTORS = [
    "system",
    "user",
    "admin",
    "escrow"
];
export const MINIMUM_GROSS_PAYMENT_USD = 50;
//# sourceMappingURL=spawn.js.map