# Spec: Factory Canister and Escrow-Backed Spawn Flow

**Status:** LOCKED
**Date:** 2026-03-10
**Author:** Codex (spec-writer) | Mode: interactive
**Complexity:** complex
**Authority:** approval
**Tier:** 3

---

## Problem

The launchpad depends on a factory canister to accept spawn requests, coordinate payment, create automaton canisters, forward funds, and register spawned automatons. That contract was underspecified, especially around payment correlation, refunds, retry behavior, and final controller ownership.

## Goal

Define an executable factory specification that supports escrow-backed spawn sessions on Base for ETH and USDC, with deterministic payment/session correlation, self-serve refunds, retryable failed spawns, indexer-visible session state, and final controller handoff so spawned automatons are self-controlled.

## Non-Goals

- Redesigning the frontend spawn wizard
- Redefining automaton internals beyond required init/config inputs
- Replacing the indexer with direct factory reads for frontend UI
- Designing the future strategy/skill repository canister
- Adding advanced treasury/accounting workflows beyond spawn-session payment handling

---

## Requirements

### Must Have

- [ ] Implement a factory canister as the source of truth for spawn sessions and spawned-automaton registry records.
- [ ] Implement an escrow-backed payment flow on `Base` for `ETH` and `USDC`.
- [ ] Use a factory-issued unique `sessionId` as the primary correlation key between factory session state and escrow payment state.
- [ ] Bind each escrow payment record to immutable quote terms, or a commitment/hash of those terms, so payment cannot be ambiguously reused for a different session.
- [ ] Support a single fixed platform fee configuration in v1.
- [ ] Support a single fixed global creation-cost quote in v1.
- [ ] Guarantee the quote for the session lifetime.
- [ ] Enforce the minimum funding rule on the gross amount paid by the user, not the automaton’s eventual net balance.
- [ ] Keep underfunded sessions in `awaiting_payment` until expiration.
- [ ] Allow the user to claim a refund after expiration for unresolved or underfunded sessions.
- [ ] If payment succeeds but spawn fails, allow both user and admin to trigger retry before expiration.
- [ ] If payment succeeds but spawn still does not complete before expiration, allow the user to reclaim funds.
- [ ] Forward the net funded amount to the spawned automaton’s EVM address after deducting platform fee and creation cost.
- [ ] Credit overpayment to the spawned automaton after deducting the quoted fee and creation cost.
- [ ] Expose explicit session lifecycle states suitable for indexer consumption.
- [ ] Treat the paying wallet as the steward at creation time.
- [ ] Keep spawning permissionless for any payer that satisfies payment requirements.
- [ ] Support a single coarse global pause switch for new spawn sessions.
- [ ] Persist retry-relevant provider secrets only long enough to survive retryable initialization/spawn failures.
- [ ] Clear provider secrets after successful completion or irrevocable refund/abandonment.
- [ ] Support optional provider inputs at spawn time:
  - `openRouterApiKey`
  - `model`
  - `braveSearchApiKey`
- [ ] Pass strategy and skill selections through structurally in v1 without catalog-level semantic validation.
- [ ] Include parent/child registry fields in the schema, even if mostly `null` in v1.
- [ ] Record auditable state transitions for each session.
- [ ] Ensure the spawned automaton ends with itself as its own controller.
- [ ] Ensure the factory is not a controller of the spawned automaton after completion.

### Should Have

- [ ] Keep the factory canister as the canonical spawned-automaton registry for indexer polling.
- [ ] Expose factory session status through the indexer/backend service rather than requiring the frontend to read factory state directly.
- [ ] Make retry behavior idempotent for repeated user/admin attempts against the same session.
- [ ] Preserve enough session and registry history to debug failed payment/spawn/refund cases without reading raw chain data.
- [ ] Expose the exact automaton build/version used for each spawned automaton.

### Could Have

- [ ] Separate explicit session sub-states for underfunded vs unpaid vs paid-failed cases if implementation benefits from finer observability.
- [ ] Add quote-term hashes to public session reads for easier external verification/debugging.
- [ ] Add a future-compatible hook for strategy/skill repository validation without changing the public session model.

---

## Constraints

- v1 assets: `ETH`, `USDC`
- v1 payment chain: `Base`
- Payment mechanism: escrow contract, not shared-address inference
- Correlation primitive: factory-issued `sessionId`
- Fee model: fixed
- Creation-cost model: fixed global quote
- Quote validity: fixed for the session lifetime
- Retry window: bounded by the original session expiration
- Retry actors: both user and admin
- Pause model: one global pause only
- Frontend status path: may use indexer/backend service
- Strategy/skill semantic validation: deferred until a repository canister exists
- High-stakes money movement: shipping requires approval

---

## Success Criteria

- Spawn session creation returns a unique `sessionId`, immutable quote terms, escrow payment instructions, and expiration.
- A valid escrow payment for a session can only progress that exact session.
- Underfunded sessions remain unresolved until expiration and then become refundable by the user.
- Paid sessions that fail during spawn/funding can be retried by user or admin before expiration.
- Expired unresolved sessions can be refunded by the user without manual admin intervention.
- Successful sessions result in:
  - a spawned automaton canister
  - net funds forwarded to the automaton EVM address
  - a registry record discoverable by the indexer
  - final controller state where the automaton is self-controlled and the factory is not a controller
- Provider secrets are not retained after completion/refund.

---

## Canister and Escrow Interfaces

### Factory Canister: public/user-facing

- [ ] `create_spawn_session(request) -> session`
  - Creates a new spawn session
  - Mints `sessionId`
  - Computes fixed quote terms
  - Returns escrow payment instructions and expiry

- [ ] `get_spawn_session(session_id) -> session_status`
  - Returns normalized session status for indexer/backend consumption

- [ ] `retry_spawn_session(session_id) -> session_status`
  - Allowed for the user/steward and admin
  - Only valid before expiration and only for retryable failure states

- [ ] `list_spawned_automatons(cursor, limit) -> page`
  - Registry read for indexer discovery

- [ ] `get_spawned_automaton(canister_id) -> registry_record`
  - Single registry record

### Factory Canister: admin/controller

- [ ] `set_fee_config(config)`
- [ ] `set_creation_cost_quote(config)`
- [ ] `set_pause(paused: bool)`
- [ ] `get_session_admin(session_id)`
- [ ] `retry_session_admin(session_id)`
- [ ] `resolve_exception(session_id, action)`

### Escrow Contract: required capabilities

- [ ] Create or register a payment claim keyed by `sessionId`
- [ ] Bind the claim to immutable quote terms or a quote commitment
- [ ] Accept payment in `ETH` or `USDC` on `Base`
- [ ] Expose payment status for a given `sessionId`
- [ ] Expose refundable state after expiration/failure
- [ ] Allow the user to claim refund after expiration when the session remains unresolved
- [ ] Prevent one paid claim from being reused for another session

---

## State Model

### Spawn Session

```ts
type SpawnSessionState =
  | "awaiting_payment"
  | "payment_detected"
  | "spawning"
  | "funding_automaton"
  | "complete"
  | "failed"
  | "expired";
```

```ts
interface SpawnSession {
  sessionId: string;
  stewardAddress: string;
  chain: "base";
  asset: "eth" | "usdc";
  grossAmount: string;
  platformFee: string;
  creationCost: string;
  netForwardAmount: string;
  quoteTermsHash: string;
  expiresAt: number;
  state: SpawnSessionState;
  retryable: boolean;
  refundable: boolean;
  paymentStatus: "unpaid" | "partial" | "paid" | "refunded";
  automatonCanisterId: string | null;
  automatonEvmAddress: string | null;
  parentId: string | null;
  config: {
    chain: "base";
    risk: number;
    strategies: string[];
    skills: string[];
    openRouterApiKey: string | null;
    model: string | null;
    braveSearchApiKey: string | null;
  };
  createdAt: number;
  updatedAt: number;
}
```

### Spawned Automaton Registry Record

```ts
interface SpawnedAutomatonRecord {
  canisterId: string;
  stewardAddress: string;
  evmAddress: string;
  chain: "base";
  sessionId: string;
  parentId: string | null;
  createdAt: number;
  versionCommit: string;
}
```

### Audit Log Entry

```ts
interface SessionAuditEntry {
  sessionId: string;
  timestamp: number;
  fromState: string | null;
  toState: string;
  actor: "system" | "user" | "admin" | "escrow";
  reason: string;
}
```

---

## Failure Modes

- [ ] **Underpayment**
  - Session remains `awaiting_payment`
  - Escrow/payment status may reflect partial payment
  - No spawn occurs
  - Refund becomes user-claimable after expiration

- [ ] **Late unresolved session**
  - Session becomes `expired`
  - User may claim refund

- [ ] **Paid but spawn failed**
  - Session becomes `failed`
  - `retryable = true`
  - User or admin may retry before expiration
  - If still unresolved by expiration, user may refund

- [ ] **Spawn succeeded but funding failed**
  - Session becomes `failed`
  - Automaton may already exist
  - Retry remains allowed before expiration
  - Expiration/refund behavior must not strand controller ownership

- [ ] **Controller handoff failed**
  - Session must not become `complete`
  - Retry/admin recovery required
  - Final invariant remains: factory not controller on successful completion

- [ ] **Provider init failed**
  - Retryable while session remains active
  - Provider secrets may be retained only for the retry window

---

## Implementation Plan

Sequential task list. Dev agent executes top-to-bottom.

- [ ] **Task 1:** Define shared factory and escrow domain types
  - Files: `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/automaton.ts`
  - Validation: `test -f packages/shared/src/spawn.ts`
  - Notes: Include session state, quote terms, audit log, registry record, and retry/refund flags.

- [ ] **Task 2:** Implement the factory canister session model and persistence
  - Files: `backend/factory/src/lib.rs`, `backend/factory/src/state.rs`, `backend/factory/src/types.rs`
  - Validation: `rg "SpawnSessionState|quoteTermsHash|expiresAt" backend/factory/src`
  - Notes: Persist sessions, registry, fee config, creation-cost config, pause flag, and audit entries in upgrade-safe state.

- [ ] **Task 3:** Implement public and admin factory methods
  - Files: `backend/factory/src/api/public.rs`, `backend/factory/src/api/admin.rs`, `backend/factory/src/lib.rs`
  - Validation: `rg "create_spawn_session|get_spawn_session|retry_spawn_session|set_pause" backend/factory/src`
  - Dependencies: Task 2
  - Notes: Keep create-session response normalized for indexer/backend consumption.

- [ ] **Task 4:** Implement escrow integration boundary
  - Files: `backend/factory/src/escrow.rs`, `backend/factory/src/types.rs`
  - Validation: `rg "sessionId|quoteTermsHash|refund" backend/factory/src/escrow.rs`
  - Dependencies: Task 3
  - Notes: Bind payment claims to `sessionId` and immutable quote terms.

- [ ] **Task 5:** Implement spawn execution pipeline
  - Files: `backend/factory/src/spawn.rs`, `backend/factory/src/controllers.rs`, `backend/factory/src/init.rs`
  - Validation: `rg "funding_automaton|set_controller|remove_controller" backend/factory/src`
  - Dependencies: Task 4
  - Notes: Create automaton, initialize config, derive/read automaton EVM address, forward funds, complete controller handoff.

- [ ] **Task 6:** Implement retry, expiration, and refund eligibility rules
  - Files: `backend/factory/src/retry.rs`, `backend/factory/src/expiry.rs`, `backend/factory/src/escrow.rs`
  - Validation: `rg "retryable|expired|refundable" backend/factory/src`
  - Dependencies: Task 5
  - Notes: Retry window must share the original expiration deadline.

- [ ] **Task 7:** Integrate factory session status into indexer/backend surface
  - Files: `apps/indexer/src/routes/spawn-sessions.ts`, `apps/indexer/src/integrations/factory-client.ts`, `apps/indexer/src/integrations/escrow-client.ts`
  - Validation: `rg "spawn-session|sessionId|factory" apps/indexer/src`
  - Dependencies: Task 6
  - Notes: Frontend should consume normalized session status from the backend/indexer path.

- [ ] **Task 8:** Wire frontend spawn flow to session creation and status tracking
  - Files: `apps/web/src/api/spawn.ts`, `apps/web/src/hooks/useSpawnSession.ts`, `apps/web/src/components/spawn/SpawnWizard.tsx`, `apps/web/src/components/spawn/steps/FundStep.tsx`
  - Validation: `rg "create_spawn_session|sessionId|expiresAt" apps/web/src`
  - Dependencies: Task 7
  - Notes: UI must show payment instructions, progress, retry, and refund-eligible states.

- [ ] **Task 9:** Add provider-secret lifecycle handling
  - Files: `backend/factory/src/init.rs`, `backend/factory/src/retry.rs`, `backend/factory/src/state.rs`
  - Validation: `rg "openRouterApiKey|braveSearchApiKey|clear" backend/factory/src`
  - Dependencies: Task 6
  - Notes: Secrets survive retryable init failures only, then must be cleared on success/refund.

- [ ] **Task 10:** Expose registry records for indexer automaton discovery
  - Files: `backend/factory/src/api/public.rs`, `apps/indexer/src/integrations/factory-client.ts`
  - Validation: `rg "list_spawned_automatons|get_spawned_automaton" backend/factory/src apps/indexer/src`
  - Dependencies: Task 5
  - Notes: Registry is canonical for factory-spawned automatons; indexer may still keep manual seeds in v1.

---

## Context Files

Files the dev agent should read before starting:

- `specs/SPEC.md`
- `specs/SPEC-INDEXER.md`
- `specs/SPEC-FACTORY.md`
- `mocks/mock-9.html`
- `tasks.md`

---

## Codebase Snapshot

- Repository currently contains product/design artifacts only: `specs/`, `mocks/`, and `tasks.md`.
- No frontend/backend implementation code is present yet in the workspace.
- This spec therefore defines new modules and paths to be created during implementation.

---

## Autonomy Scope

### Decide yourself:

- Exact internal canister module boundaries
- Exact Rust type names and enum layout
- Exact indexer route shapes, as long as they preserve the session semantics in this spec
- Exact escrow client adapter structure
- Exact audit-log storage representation

### Escalate (log blocker, skip, continue):

- Any change to the chosen payment mechanism away from escrow
- Any change to fee model or quote model
- Any deviation from self-serve refunds in v1
- Any deviation from the controller-handoff invariant
- Any change to retry actors or retry deadline semantics

---

## Verification

### Smoke Tests

- `rg "sessionId|quoteTermsHash|expiresAt" backend/factory/src` -- proves the core session correlation and expiry fields exist
- `rg "set_controller|remove_controller|self" backend/factory/src` -- proves controller handoff logic is implemented
- `rg "retryable|refundable|expired" backend/factory/src` -- proves retry/refund state handling exists
- `rg "spawn-session|factory|escrow" apps/indexer/src` -- proves backend/indexer integration exists
- `rg "sessionId|expiresAt|retry|refund" apps/web/src` -- proves frontend session tracking is wired

### Expected State

- File `backend/factory/src/lib.rs` exists and is >200 bytes
- File `backend/factory/src/escrow.rs` exists and is >200 bytes
- File `apps/indexer/src/routes/spawn-sessions.ts` exists and is >100 bytes
- File `apps/web/src/api/spawn.ts` exists and is >100 bytes
- The string `quoteTermsHash` appears in factory code
- The string `retryable` appears in factory code
- The string `refundable` appears in factory code

### Regression

- `cargo test -p factory` passes
- `cargo test -p integration-tests factory` passes
- `npm test -- --runInBand` passes

### Integration Test

- Create a spawn session, pay escrow for the exact quoted amount, observe session progression to `complete`, verify a registry record exists, verify net funds were forwarded, and verify the spawned automaton no longer lists the factory as controller.

---

## Progress

_Dev agent writes here during execution._

### Completed
(none yet)

### Blockers
(none yet)

### Learnings
(none yet)

---

## Ship Checklist (non-negotiable final step)

- [ ] Add entry to `CHANGELOG.md`
- [ ] Remove from queues if queued
- [ ] Run verification suite (all smoke tests + regression)
