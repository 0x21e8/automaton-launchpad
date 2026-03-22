# Design: Factory-Driven Spawn Integration Across `automaton-launchpad` and `ic-automaton`

**Status:** Proposed, execution-ready checklist
**Date:** 2026-03-21
**Audience:** engineers working on `automaton-launchpad`, `backend/factory`, and `ic-automaton`
**Scope:** convert the current design into a concrete, checkable delivery plan

## Summary

The target split is still correct:

- the factory canister owns spawn sessions, payment verification, install orchestration, and the spawned-automaton registry
- the indexer remains a proxy/cache/read model for the web app
- `ic-automaton` accepts bootstrap fields at install time and becomes self-controlled after handoff

What changes in this revision is the delivery shape. The repo is not at a blank-slate design stage anymore. `automaton-launchpad` already contains:

- a Rust factory domain model with session lifecycle, retry logic, expiry handling, and registry state
- TypeScript shared spawn contracts used by the indexer and web app
- indexer routes and a `FactoryAdapter` seam
- an indexer-side `EscrowClient` that the target design should remove

This document therefore focuses on the delta from the current codebase to the target architecture, with explicit blockers, simplifications, and acceptance criteria.

## Problem

The launchpad flow is structurally correct at the UI and API contract level but incomplete at the real execution boundary:

- `backend/factory` is still a plain Rust library with mocked runtime/install behavior
- the factory does not yet create/install real canisters or use IC management canister APIs
- the factory does not derive or use a real Base EVM address
- escrow payment detection is modeled in repo state, not verified from Base logs
- the indexer still models escrow as a separate integration instead of factory-owned payment state
- `ic-automaton` bootstrap changes and artifact publication live in another repo and are therefore an external dependency

## Goals

- Keep the factory canister as the source of truth for spawn sessions and spawned-automaton registry records.
- Keep the indexer as a read/proxy layer for the web app.
- Make the factory able to install and initialize a real `ic-automaton` canister from a compiled Wasm artifact.
- Make the factory able to verify Base escrow payments directly via HTTPS outcalls.
- Make the automaton accept its spawn bootstrap configuration at install time.
- Remove indexer-owned escrow verification logic.
- Define a repeatable artifact handoff between repos.
- Make the resulting work checkable per task, not just by phase.

## Non-Goals

- Moving spawn ownership into the indexer
- Merging `automaton-launchpad` and `ic-automaton`
- Reworking the existing launchpad UX
- Adding child-spawn semantics beyond carrying `parent_id`
- Defining strategy/skill install-time semantics
- Solving post-spawn self-upgrade or fleet upgrade orchestration

## Current Codebase Snapshot

### `automaton-launchpad` already has

- `backend/factory/src/api/public.rs`
  - session creation, read, retry, refund, registry listing
- `backend/factory/src/escrow.rs`
  - in-memory escrow claim registration and payment synchronization
- `backend/factory/src/spawn.rs`
  - mocked spawn execution with fabricated canister ID / EVM address and in-memory controller handoff
- `backend/factory/src/state.rs`
  - thread-local state snapshotting, fee config, creation-cost config, session TTL, version commit
- `packages/shared/src/spawn.ts`
  - shared session/payment/registry contracts for the web app and indexer
- `apps/indexer/src/integrations/factory-client.ts`
  - `FactoryAdapter` abstraction with an unconfigured default implementation
- `apps/indexer/src/integrations/escrow-client.ts`
  - separate escrow integration surface that conflicts with the target design
- `apps/indexer/src/routes/spawn-sessions.ts`
  - spawn routes already calling factory and escrow clients and persisting `SpawnSessionDetail`
- `apps/indexer/src/store/schema.sql`
  - `spawn_sessions.escrow_json`, which encodes the current split-brain model

### `automaton-launchpad` does not yet have

- management canister calls for install/delete/update-settings
- threshold ECDSA key derivation/signing for the factory
- HTTPS outcalls to Base RPC
- artifact upload/storage APIs
- cycles pool accounting/health reporting
- a real `CanisterFactoryAdapter` in the indexer
- a migration away from indexer-owned escrow state

### External dependency

`ic-automaton` changes are required before real spawn execution can succeed. This repo can prepare for that integration, but it cannot complete it alone.

### Implementation notes from Track 2

- `backend/factory` now compiles as an IC canister with `ic-cdk 0.19.0` and `candid 0.10.24`.
- The checked-in candid artifact is [`backend/factory/factory.did`](../backend/factory/factory.did), and the root deploy config is [`icp.yaml`](../icp.yaml).
- Production `create_spawn_session` uses `raw_rand()` to generate UUID v4 session IDs; native tests keep a deterministic nonce-seeded fallback.
- `FactoryInitArgs` and `FactoryConfigSnapshot` now carry the Base RPC endpoint, cycles pool thresholds, artifact hash, and escrow contract address, which later payment and spawn tracks should treat as the canonical config surface.

## Locked Decisions

These decisions are final and must be reflected consistently across all files, types, and tests.

### DEC-01: v1 payment scope is Base USDC only

`SUPPORTED_SPAWN_ASSETS` is reduced to `["usdc"]`. `SpawnAsset.Eth`, `FeeConfig.eth_fee`, and
`CreationCostQuote.eth_cost` are removed. The shared TS contract, Rust types, and Solidity examples
must all say the same thing.
Done when: `packages/shared`, `backend/factory/src/types.rs`, and `SPEC-FACTORY.md` contain no ETH payment path.

### DEC-02: Provider API keys are piped through the factory at spawn time

`ProviderConfig` fields (`openRouterApiKey`, `braveSearchApiKey`) are included in `SpawnConfig` and
forwarded to `ic-automaton` via `InitArgs` at install time. The following security rules are mandatory
and are not optional implementation details:

- Secrets must never appear in session audit log entries or admin views.
- Secrets must be cleared from factory session state immediately after `install_code` succeeds
  (the factory has no further need of them once they are in the automaton).
- If install fails and the session is retried, the steward must re-supply secrets with the retry
  request — the factory does not persist them across retry boundaries.
- Secrets must never be included in registry records or health queries.
- `SpawnSessionDetail` returned by the indexer must redact secret fields before serialising to JSON.

Done when: shared contracts include `ProviderConfig` fields, the factory clears them post-install,
and the indexer redacts them from all API responses.

### DEC-03: `complete` means release broadcasted; stuck-tx recovery is tracked separately

For v1, `SpawnSession.state = complete` means:
- canister installed
- automaton EVM address derived
- controller handoff finalized
- release transaction successfully built and broadcast

The release tx hash and broadcast timestamp are persisted in factory state. The session does not block on
on-chain confirmation. Stuck-tx detection and re-broadcast are handled by a dedicated task (LP-10b).

### DEC-06: `funding_automaton` is renamed to `broadcasting_release`

The state between install-complete and session-complete maps to broadcasting the escrow `release()` tx
on Base — not to moving funds through the factory. `funding_automaton` is a misnomer in the target
architecture. The renamed state is `broadcasting_release`.

Full v1 state machine:
```
awaiting_payment → payment_detected → spawning → broadcasting_release → complete
                                              ↘ failed ↗  (retryable)
                       any non-complete state → expired   (refundable if paid)
```

All uses of `funding_automaton` / `FundingAutomaton` / `FUNDING_AUTOMATON_STATE` in
`packages/shared`, `backend/factory/src/types.rs`, and tests must be updated as part of LP-01.

### DEC-07: `"escrow"` is removed from `SESSION_AUDIT_ACTORS`

With factory-owned payment detection, the actor that drives `PaymentDetected` transitions is the
factory's own timer/polling loop — `system`. The `escrow` audit actor has no meaning in the target
architecture and is removed. Existing tests that assert `actor == "escrow"` must be updated to
`actor == "system"` as part of LP-01.

### DEC-08: Session IDs are UUID v4 strings; generation uses `raw_rand` in production, nonce-seeded in tests

`create_spawn_session` in an IC canister must call `ic_cdk::api::management_canister::raw_rand()`
(async, returns 32 random bytes) to generate a UUID v4 session ID. This makes the method an
`async` IC update call. The current synchronous Rust signature changes in LP-04.

For unit tests (no IC runtime), session IDs are generated deterministically from the session
nonce (e.g. `format!("{:08x}-0000-4000-8000-{:012x}", nonce, nonce)`). Tests must not depend on
the exact UUID format beyond "string, unique per session".

LP-01 changes the contract type only (session_id: `String`, documented as UUID v4).
LP-04 changes the generation mechanism when wrapping into IC entrypoints.
These two tasks must not be merged.

### DEC-09: `SpawnConfig` no longer extends `ProviderConfig`; `ProviderConfig` is a nested field

`SpawnConfig` becomes a flat interface that holds a `provider: ProviderConfig` field rather than
inheriting from `ProviderConfig`. This makes the secret boundary explicit in both TypeScript and
Rust: code that needs to redact or clear secrets operates on `config.provider` as a unit, not on
scattered top-level fields.

`ProviderConfig` retains `openRouterApiKey`, `braveSearchApiKey`, and `model`. The
`extends ProviderConfig` inheritance in `spawn.ts` is removed.

### DEC-04: `sessionId` is a UUID v4 string; `claimId` encodes it as UTF-8 bytes

`claimId = keccak256(abi.encodePacked(sessionId))` where `sessionId` is treated as raw UTF-8 bytes.
Both Rust and the TS indexer must derive `claimId` the same way before passing it to Solidity.
Concretely: `keccak256(Buffer.from(sessionId, 'utf8'))` in TS, and the equivalent byte slice in Rust.

### DEC-05: `version_commit` is a 40-character lowercase git SHA

All uses of `version_commit` — in `SpawnedAutomatonRecord`, `FactoryConfigSnapshot`, and `ic-automaton`
`InitArgs` — must be a 40-char hex string matching the exact commit of the installed `ic-automaton` Wasm.
The `"dev-build"` default in `state.rs` is only valid for local development; deploy scripts must reject
a factory configured with a non-SHA value.

## Target Architecture

### Responsibilities

#### Web app

- Collects spawn configuration from the user
- Calls indexer spawn-session routes
- Displays quote, payment instructions, payment status, retry/refund state, and completion state
- Reads spawned canister ID and EVM address from the session/registry response once state is `complete`
- Never installs canisters directly

#### Indexer

- Proxies create/read/retry/refund calls to the factory canister
- Polls the factory canister for session state and spawned-automaton registry records
- Resolves session → registry record so the web app has canister ID without a separate registry lookup
- Polls spawned automaton canisters for runtime/detail data
- Persists normalized read models for the web app
- Does not verify payments independently

#### Factory canister

- Creates spawn sessions and immutable quotes
- Computes and exposes `claimId` (see DEC-04)
- Verifies deposits from Base logs via HTTPS outcalls to Base RPC
- Creates/installs/configures new canisters from a pre-loaded `ic-automaton` Wasm
- Calls post-install bootstrap methods on the spawned automaton
- Signs and broadcasts the escrow `release()` transaction on Base
- Transfers control so the automaton becomes self-controlled
- Registers the spawned automaton in the canonical registry

#### `ic-automaton`

- Accepts optional factory bootstrap fields in `InitArgs`
- Persists steward and session metadata
- Derives its EVM address after install
- Operates without factory control after handoff

## Design Corrections and Simplifications

### 1. `claimId` must be a first-class contract field

`claimId = keccak256(abi.encodePacked(sessionId))` where `sessionId` is a UUID v4 string encoded as
UTF-8 bytes (see DEC-04). Add `claimId` to:
- `SpawnPaymentInstructions` (primary exposure point)
- the factory escrow/payment record (`EscrowClaim`)
- optionally mirror on `SpawnSession` for UI access without dereferencing `payment`

### 2. Base USDC is the v1 payment scope (DEC-01)

ETH payment variants are removed until a fully specified ETH escrow path exists.

### 3. Factory-complete vs funds-complete (DEC-03)

`complete` means release broadcasted. Stuck-tx recovery is a separate task (LP-10b). See DEC-03.

### 4. Indexer-owned escrow state should be removed, not just ignored

- remove `apps/indexer/src/integrations/escrow-client.ts`
- remove `escrowClient` wiring from the server and Fastify types
- stop persisting separate escrow records in the indexer
- let the indexer cache only factory-owned session/payment state

### 5. Provider secrets are piped through the factory with mandatory clearing (DEC-02)

`ProviderConfig` fields travel with `SpawnConfig` from the web app → indexer → factory → `ic-automaton`
`InitArgs`. After `install_code` succeeds, the factory immediately clears them from session state.
If install fails, the factory clears them before returning the error so they are never persisted across
a failure boundary. The steward must re-supply secrets on retry. The indexer redacts `provider` fields
from all `SpawnSessionDetail` API responses. See DEC-02 for the full rule set.

### 6. Artifact persistence should be simple and explicit

- store one active artifact in stable state
- persist `wasm_bytes`, `wasm_sha256` (SHA-256, hex), and `version_commit` (40-char git SHA)
- `update_artifact()` recomputes SHA-256 from the uploaded bytes and rejects if it does not match the
  caller-supplied hash — integrity is checked at upload time, not at install time
- reject spawn attempts if no artifact is loaded

### 7. Escrow contract address is a factory config parameter

The Base escrow contract address must be stored in `FactoryConfig` (init args + admin update) and
validated before any spawn attempt. It must appear in the factory health query.

### 8. Session expiry during active spawn

If a session's TTL expires after payment is confirmed but before `create_canister` completes, the
factory must:
1. Mark the session `failed` with `retryable = true` and `refundable = false`.
2. Delete any orphaned (created but not installed) canister.
3. Allow the steward to retry, which extends effective lifetime.

The steward may not claim a refund on a paid session that is in a terminal-but-retryable state
until it has been retried and the retry has itself expired. This rule must be documented in the
session state machine (see DEC-06 for the full state diagram).

### 9. HTTPS outcall cycle cost is a health concern

`eth_getLogs` and `eth_sendRawTransaction` are HTTPS outcalls and consume cycles proportional to
response size. The factory health query (LP-13) must expose an estimated outcall cycle cost per
poll interval alongside `cycles_per_spawn` so operators can budget the ongoing polling cost
separately from the per-spawn cost.

### 10. Canister ID delivery to the web app

Once a session reaches `complete`, the web app must be able to display the spawned canister ID and
EVM address without a separate registry lookup. The indexer resolves the session → registry record
join server-side and includes `registryRecord` in `SpawnSessionDetail`. The indexer polling loop
(LP-15) must include registry record hydration.

## Checkable Task List

This list is sequential where dependencies matter.

### Track 1: Align the shared/public spawn contract

- [x] `LP-01` Align TypeScript and Rust spawn contracts around the final v1 shape.
  Files: `packages/shared/src/spawn.ts`, `packages/shared/test/contracts.test.ts`, `backend/factory/src/types.rs`, `backend/factory/src/lib.rs` (tests)
  Details:
  - add `claimId` to `SpawnPaymentInstructions` and `EscrowClaim`
  - add `claimId` to `SpawnSession` for UI convenience
  - remove `SpawnAsset.Eth`, `FeeConfig.eth_fee`, `CreationCostQuote.eth_cost` (DEC-01)
  - restructure `SpawnConfig`: remove `extends ProviderConfig`; add `provider: ProviderConfig` as an explicit nested field; `ProviderConfig` retains all three fields (`openRouterApiKey`, `braveSearchApiKey`, `model`) (DEC-02, DEC-09)
  - rename `funding_automaton` → `broadcasting_release` everywhere: TS const array, Rust enum variant, string literal, `FUNDING_AUTOMATON_STATE` constant (DEC-06)
  - remove `"escrow"` from `SESSION_AUDIT_ACTORS` and `SessionAuditActor` Rust enum (DEC-07)
  - add `releaseTxHash: string | null` and `releaseBroadcastAt: number | null` to `SpawnSession` and `SpawnExecutionReceipt` (DEC-03)
  - document `sessionId` as UUID v4 string in a code comment; no change to generation mechanism yet (DEC-08)
  - lock `versionCommit` as 40-char hex SHA; update `SpawnedAutomatonRecord` and `FactoryConfigSnapshot` (DEC-05)
  - add `escrowContractAddress: string` to `FactoryConfigSnapshot`
  - update all Rust tests in `backend/factory/src/lib.rs` that use `SpawnAsset::Eth`, flat `ProviderConfig` fields, ETH gross amounts, `FundingAutomaton`, or `SessionAuditActor::Escrow`; migrate to `config.provider.open_router_api_key` access pattern
  - update `contracts.test.ts` fixture: switch to `asset: "usdc"`, move provider fields under `config.provider`, use `broadcasting_release` in state list, set `versionCommit` to a 40-char hex string
  Implementation note for LP-04 / LP-15:
  - Rust `SpawnSession` previously carried a nested `payment` object that did not exist in the shared TypeScript contract. Track 1 removes that extra public field. Future Candid and indexer mappings must keep payment instructions on `SpawnQuote.payment`, mirror only `claimId` on `SpawnSession`, and avoid reintroducing a nested `session.payment` shape.
  Done when:
  - TypeScript and Rust name the same fields and state values
  - `SpawnConfig` uses nested `provider: ProviderConfig` in both languages
  - no `eth` asset, `funding_automaton`, or `escrow` actor remain anywhere in shared contracts or tests
  - `claimId` derivation is covered by a cross-language test fixture (UTF-8 bytes of UUID string → keccak256)

- [x] `LP-02` Update indexer route and store types to match the factory-owned payment model.
  Files: `apps/indexer/src/routes/spawn-sessions.ts`, `apps/indexer/src/store/sqlite.ts`
  Scope: types and route handler logic only; schema migration is LP-17.
  Details:
  - stop treating escrow as an independently fetched document
  - derive `SpawnSessionDetail` from factory session + registry record only
  - remove `escrow` field from `SpawnSessionDetail` or replace with factory-sourced payment fields
  Done when:
  - `SpawnSessionDetail` no longer requires a separate escrow integration to be meaningful

Implementation note for LP-15 / LP-20:
- `SpawnSessionDetail` now carries factory-owned immutable `payment: SpawnPaymentInstructions` instead of a legacy `escrow` document. The indexer persists that shape in `spawn_sessions.payment_json` so a page reload can still show `paymentAddress` and other instructions after the original create response is gone.
- Legacy cached rows that predate `payment_json` are treated as stale and must be rehydrated from the factory before they are served again. Future cache/schema work should preserve that refetch seam instead of fabricating partial payment instructions from session fields alone.

### Track 2: Turn `backend/factory` into a real IC canister

- [x] `LP-03` Add canister dependencies and build outputs to the factory crate.
  Files: `backend/factory/Cargo.toml`, `backend/factory/src/lib.rs`, factory Candid output path, project deploy config
  Current gap:
  - `Cargo.toml` contains only package metadata
  - there are no `ic-cdk` or `candid` dependencies yet
  Done when:
  - the crate builds as an IC canister
  - public/update/query methods are exported through a generated `.did`

- [x] `LP-04` Convert public/admin APIs from plain Rust helpers to IC entrypoints.
  Files: `backend/factory/src/lib.rs`, `backend/factory/src/api/public.rs`, `backend/factory/src/api/admin.rs`
  Details:
  - wrap user methods with `#[ic_cdk::update]` / `#[ic_cdk::query]`
  - replace string-based auth with `ic_cdk::caller()`
  - define init args for admin principal(s), config, and bootstrap defaults including `escrow_contract_address`
  - make `create_spawn_session` an `async` update call; generate UUID v4 session IDs using `ic_cdk::api::management_canister::raw_rand()` (see DEC-08); unit tests use nonce-seeded deterministic UUIDs via a testable abstraction
  Done when:
  - caller authorization no longer relies on string literals like `"admin"`
  - the factory can be installed and called through Candid
  - session IDs are UUID v4 strings in all production code paths

- [x] `LP-05` Add upgrade-safe state serialization for all new factory fields.
  Files: `backend/factory/src/state.rs`, `backend/factory/src/lib.rs`, `backend/factory/src/types.rs`
  Details:
  - derive `CandidType`, `Serialize`, `Deserialize` on public persisted types
  - add `pre_upgrade` / `post_upgrade`
  - include new config fields: `escrow_contract_address`, artifact metadata (`wasm_sha256`, `version_commit`), Base RPC endpoint, `cycles_per_spawn`, `min_pool_balance`, release tracking (`release_tx_hash`, `release_broadcast_at`) per session
  Done when:
  - an upgrade round-trip preserves sessions, registry, artifact metadata, and all new config fields

### Track 3: Replace the mocked spawn path with real management-canister execution

- [x] `LP-06` Replace fabricated runtime initialization with real canister creation and install.
  Files: `backend/factory/src/spawn.rs`, `backend/factory/src/init.rs`, `backend/factory/src/controllers.rs`, `backend/factory/src/state.rs`
  Current gap:
  - `spawn.rs` currently fabricates canister IDs and EVM addresses
  - `init.rs` builds an in-memory runtime only
  Done when:
  - the factory calls `create_canister`
  - the factory calls `install_code` with the configured `ic-automaton` Wasm
  - install failures delete orphaned canisters and leave the session `failed` with `retryable = true`
  - if session TTL expires during spawn, the orphaned canister is deleted, session is marked `failed`/`retryable`, and the steward can retry (see Design Correction §8)

- [x] `LP-07` Persist substep progress so retries resume safely.
  Files: `backend/factory/src/spawn.rs`, `backend/factory/src/retry.rs`, `backend/factory/src/state.rs`, `backend/factory/src/types.rs`
  Details:
  - store created canister ID before downstream steps
  - store whether install succeeded
  - store whether EVM derivation succeeded
  - store whether release tx was built/broadcast (`release_tx_hash`, `release_broadcast_at`)
  Done when:
  - retry does not recreate or double-release when a later substep fails

- [x] `LP-08` Implement real controller handoff using management canister settings.
  Files: `backend/factory/src/controllers.rs`, `backend/factory/src/spawn.rs`
  Details:
  - add self controller
  - remove factory controller via `update_settings`
  - verify final controller set is `[self]` by calling `canister_status` after `update_settings`
  Done when:
  - handoff is performed against a live canister, not only in mocked runtime state
  - `canister_status` confirms `controllers == [automaton_canister_id]` before the session is marked complete

### Implementation notes from Track 3

- `backend/factory/src/init.rs` now builds the install payload as `AutomatonInstallArgs`; `ic-automaton` needs to accept that candid shape at install time.
- `backend/factory/src/spawn.rs` now stores the canister ID before install, records install and EVM-derivation timestamps in runtime state, and treats a failed retry as a fresh spawn only when install never completed.
- Retry now extends the session TTL when a failed session is resumed, so a late retry can reopen the effective lifetime instead of being blocked by the original deadline.
- The wasm controller handoff uses a two-step settings update (`[factory,self]` then `[self]`) so the factory can still clean up if the final verification fails.

### Track 4: Add factory EVM and escrow release support

- [x] `LP-09` Add `derive_factory_evm_address()` and persist the result.
  Files: `backend/factory/src/lib.rs`, `backend/factory/src/state.rs`, `backend/factory/src/types.rs`
  Details:
  - call `ecdsa_public_key`
  - derive the Base address deterministically
  - make the method idempotent
  Done when:
  - the factory exposes its Base address for escrow deployment and ops
  - `OPS-03` (fund factory ETH for gas) is a prerequisite before LP-10 can be exercised in any environment

- [x] `LP-10` Add release transaction building/signing/broadcasting.
  Files: `backend/factory/src/spawn.rs`, new EVM/Base helper module(s), `backend/factory/src/state.rs`
  Details:
  - ABI-encode `release(claimId, recipient)`
  - sign with threshold ECDSA
  - send with `eth_sendRawTransaction`
  - persist `release_tx_hash` and `release_broadcast_at` per session
  Prerequisite: factory Base address funded with ETH for gas (OPS-03).
  Done when:
  - a successful spawn records the release broadcast artifact needed for support/debugging

### Implementation notes from Track 4

- `backend/factory/src/evm.rs` now owns the Base address derivation and release-broadcast helpers. `derive_factory_evm_address()` is idempotent and persists both `factory_evm_address` and `factory_evm_address_derived_at` in stable state.
- `get_factory_config()` now exposes `factory_evm_address` for ops, and `backend/factory/factory.did` was updated to keep the candid surface in sync.
- Release broadcasts fail fast if `base_rpc_endpoint` is unset, so that config is a hard precondition for exercising LP-10 in local tests as well as on-chain.
- The release broadcast path signs the typed transaction with threshold ECDSA, recovers the signing parity from the returned signature, and persists the returned broadcast hash/timestamp on the session.

- [ ] `LP-10b` Add stuck-tx detection and re-broadcast for release transactions.
  Files: `backend/factory/src/spawn.rs`, existing EVM/Base helpers, timer setup in `backend/factory/src/lib.rs`
  Details:
  - on each payment poll cycle (or a separate slower timer), check `eth_getTransactionReceipt` for sessions in `complete` state where `release_tx_hash` is set but not yet confirmed
  - if the tx is absent from the mempool after a configurable block threshold (e.g. 20 blocks), re-sign and re-broadcast with bumped gas price
  - persist the replacement tx hash and timestamp; keep the original hash for audit
  Done when:
  - a session whose release tx was dropped is automatically re-broadcast without operator intervention
  - RISK-04 is resolved

### Track 5: Add Base payment verification

- [x] `LP-11` Replace local `record_escrow_payment()` assumptions with Base log polling.
  Files: `backend/factory/src/escrow.rs`, `backend/factory/src/state.rs`, new Base RPC helper module(s)
  Details:
  - compute and store `claimId` at session creation (see DEC-04)
  - poll `eth_getLogs` for `Deposited(claimId, payer, amount)` against the configured `escrow_contract_address`
  - use a rolling `fromBlock` per session (persisted as `last_scanned_block`) so scans resume correctly after restarts or upgrades; never scan more than 10 000 blocks per call (Base RPC limit)
  - translate logs into the factory payment/session state machine
  Done when:
  - payment detection comes from Base RPC responses, not direct local mutation
  - `last_scanned_block` is stored per session and survives upgrade

- [x] `LP-12` Add a polling model that is simple to operate and cycle-efficient.
  Files: `backend/factory/src/escrow.rs`, `backend/factory/src/state.rs`, timer setup in `backend/factory/src/lib.rs`
  Recommendation:
  - use one global timer for all active sessions
  - batch `eth_getLogs` across all active sessions in a single call using the union of their `claimId` values in the filter, rather than issuing one call per session — this avoids serialized HTTPS outcall hangs blocking the entire polling loop
  - store `last_scanned_block` globally and per-session to support incremental scans
  Done when:
  - the factory can recover from temporary RPC failures without losing payment progress
  - a single RPC call services all active sessions in one round

### Implementation notes from Track 5

- `backend/factory/src/base_rpc.rs` now centralizes Base JSON-RPC helpers for `eth_blockNumber` and batched `eth_getLogs`; LP-10b should extend this module for `eth_getTransactionReceipt` rather than adding a second parser/outcall stack.
- The current scheduler is a single heartbeat-gated polling loop in `backend/factory/src/lib.rs` with an in-flight guard and persisted `next_payment_poll_at_ms`. LP-10b can reuse that cadence for release-tx receipt checks instead of introducing a second concurrent loop.
- New sessions now inherit the factory's global payment scan cursor when one exists. This avoids unnecessary historical rescans and keeps the first batched poll for new sessions aligned with the most recent known Base head.
- When the factory has never scanned Base before, the first payment poll bootstraps from `latest_block - 9_999` so the initial `eth_getLogs` call stays inside the Base RPC 10,000-block limit. Future deploy/runbook work should treat that bootstrap window as an operational assumption.
- Payment reconciliation updates payment totals before expiring an overdue session, so a payment observed after the wall-clock deadline still leaves the expired session refundable when the claim was partially or fully funded.

### Track 6: Add cycles and artifact management

- [x] `LP-13` Add cycles pool thresholds and a factory health query.
  Files: `backend/factory/src/state.rs`, `backend/factory/src/types.rs`, `backend/factory/src/api/admin.rs`, `backend/factory/src/lib.rs`
  Details:
  - add `cycles_per_spawn` (cycles consumed per full spawn execution)
  - add `min_pool_balance` (spawn attempts fail early below this threshold)
  - add `estimated_outcall_cycles_per_interval` to health so operators can budget ongoing polling cost
  - expose in health query: current canister balance, paused status, artifact version, active session counts, `escrow_contract_address`
  Done when:
  - spawn attempts fail early when the cycles pool is insufficient
  - the indexer can surface factory health without special-casing escrow
  - HTTPS outcall cycle cost is visible to operators

- [x] `LP-14` Add artifact upload and validation.
  Files: `backend/factory/src/state.rs`, `backend/factory/src/types.rs`, `backend/factory/src/api/admin.rs`, `backend/factory/src/lib.rs`
  Details:
  - persist the active artifact in stable state: `wasm_bytes`, `wasm_sha256` (hex), `version_commit` (40-char git SHA)
  - `update_artifact(wasm_bytes, expected_sha256, version_commit)`: recompute SHA-256 from uploaded bytes and reject if it does not match `expected_sha256` — integrity is verified at upload time
  - reject spawn attempts if no artifact is loaded
  Done when:
  - the factory can install the active artifact after upgrade without external manual patching
  - a corrupt or wrong-hash upload is rejected before it can ever be used in a spawn

### Implementation notes from Track 6

- The factory now exposes a public `get_factory_health()` query that returns current canister balance, pause state, `cycles_per_spawn`, `min_pool_balance`, `estimated_outcall_cycles_per_interval`, `escrow_contract_address`, the derived factory EVM address, active-session counts, and a compact artifact snapshot. `LP-15` and `LP-20` should consume this query directly instead of scraping admin config for health signals.
- `execute_spawn()` now rejects before mutating session state when no artifact is loaded or when `current_canister_balance < cycles_per_spawn + min_pool_balance` (native tests use a mock balance; wasm uses the live canister balance). Future spawn/retry work should preserve that early-fail ordering so retries stay idempotent.
- `update_artifact(wasm_bytes, expected_sha256, version_commit)` is admin-only and is now the canonical way to set the active install artifact. It recomputes SHA-256 at upload time, requires lowercase hex for both the 64-char artifact hash and 40-char `version_commit`, and updates the factory's active `version_commit` together with the wasm payload. `LP-15` should treat the health artifact snapshot as the read model for uploaded artifact visibility.

### Track 7: Rewire the indexer around a real factory canister

- [x] `LP-15` Implement a real `CanisterFactoryAdapter`.
  Files: `apps/indexer/src/integrations/factory-client.ts`, new canister adapter module(s), `apps/indexer/src/config.ts`
  Details:
  - use `@dfinity/agent`
  - map Candid responses into shared TS contracts
  - support create/get/retry/refund/list/get-one methods
  - polling loop must hydrate the registry record for each session so `SpawnSessionDetail.registryRecord` is always populated when a session is `complete` (web app canister ID delivery)
  Done when:
  - the indexer can run against a live local or mainnet factory canister

- [x] `LP-16` Remove the indexer escrow integration entirely.
  Files: `apps/indexer/src/integrations/escrow-client.ts`, `apps/indexer/src/server.ts`, `apps/indexer/src/types.ts`, `apps/indexer/src/routes/spawn-sessions.ts`, `apps/indexer/src/routes/health.ts`
  Details:
  - delete `EscrowClient`
  - remove Fastify decoration and health reporting for escrow
  - resolve spawn session detail from the factory only
  Done when:
  - the indexer no longer has an escrow-specific runtime dependency

- [x] `LP-17` Migrate the indexer persistence schema to the new factory-owned session model.
  Files: `apps/indexer/src/store/schema.sql`, `apps/indexer/src/store/sqlite.ts`, related tests
  Scope: schema changes and migration only; route/type changes are LP-02.
  Details:
  - rename or drop `spawn_sessions.escrow_json`; replace with factory-sourced payment fields including `claim_id`
  - add columns for `release_tx_hash` and `release_broadcast_at`
  Done when:
  - schema names and cached payloads match the new architecture
  - no `escrow_json` column remains

### Implementation notes from Track 7

- `apps/indexer/src/integrations/factory-canister-adapter.ts` now owns the Candid mapping boundary for the factory canister using `@dfinity/agent` and `@dfinity/candid`. It fetches the root key automatically for non-HTTPS hosts, so local-replica indexer configs can talk to the factory without extra bootstrap code.
- `buildServer()` now instantiates a real canister-backed `FactoryClient` automatically whenever `factoryCanisterId` is configured. `GET /health` also reads `get_factory_health()` directly, so LP-20 should assert against the public health payload rather than any internal config snapshot.
- The indexer no longer has an escrow runtime integration or an `escrow_json` cache column. For compatibility with the current shared `SpawnSessionDetail` type, the route still serialises `escrow: null`; LP-02 should remove that legacy field from the TypeScript contract instead of reintroducing any escrow-specific backend state.
- SQLite startup now migrates legacy `spawn_sessions` tables in place by rebuilding them with `claim_id`, `release_tx_hash`, and `release_broadcast_at` columns sourced from the cached session JSON. Any future schema work should preserve that migration seam instead of assuming a fresh database.

### Track 8: Testing and verification in this repo

- [ ] `LP-18` Add factory unit tests for contract/state evolution.
  Files: `backend/factory/src/lib.rs` test module and/or dedicated test files
  Cover:
  - contract field evolution
  - auth rules
  - quote creation
  - retry/refund invariants
  - release tracking invariants
  - `claimId` derivation matches the DEC-04 encoding rule
  - stuck-tx re-broadcast path (LP-10b)

- [ ] `LP-19` Add PocketIC tests for real spawn execution.
  Files: factory test harness and local test infra
  Cover:
  - create session
  - detect mocked Base payment
  - create canister
  - install real `ic-automaton` Wasm
  - derive EVM address
  - hand off controller; verify via `canister_status`
  - record release tx hash

- [x] `LP-20` Add indexer integration tests against a real factory adapter.
  Files: `apps/indexer/test/*`
  Cover:
  - configured vs unconfigured factory modes
  - session polling and caching
  - registry reads and session → registry record join
  - `/health` factory visibility including cycles and escrow contract address
  - realtime events for session updates

### Implementation notes from Track 8

- `apps/indexer/test/factory-canister-adapter.test.ts` now exercises the real `CanisterFactoryAdapter` mapping layer with mocked Candid actor responses instead of bypassing it through a stubbed `FactoryClient`. This covers optional/variant decoding, `SessionNotFound` / `RegistryRecordNotFound` null handling, and health mapping.
- `CanisterFactoryAdapter` gained test-only constructor seams for `createAgent` / `createActor`. Future adapter tests should use those seams rather than monkey-patching private methods or stubbing `FactoryClient`, so the Candid mapping boundary stays under test.
- `backend/factory/src/lib.rs` now explicitly tests unauthorized admin/steward paths and replaying `execute_spawn()` after completion to ensure release tracking is stable across idempotent reads.
- `LP-18` remains open until `LP-10b` exists. The Track 8 checklist requires unit coverage for stuck-tx re-broadcast, and there is no implementation to exercise yet.
- `LP-19` is still blocked in this repo by missing PocketIC/local-canister harness code and by the external `ic-automaton` Wasm/init compatibility dependency (`IA-01`/`IA-02`). When that work starts, add the harness in-repo first instead of trying to bolt PocketIC directly into the current unit-test module.

## External Tasks in `ic-automaton`

- [ ] `IA-01` Extend `InitArgs` with optional factory bootstrap fields.
  Required fields:
  - `session_id` (UUID v4 string, per DEC-08)
  - `steward_address`
  - `parent_id`
  - `risk`
  - `model` (string or null)
  - `open_router_api_key` (string or null)
  - `brave_search_api_key` (string or null)
  - `factory_principal`
  - `version_commit` (40-char git SHA, per DEC-05)
  Security: `ic-automaton` must not log or expose secret fields in query responses. They are
  consumed at init time and should be stored only in the automaton's own encrypted/restricted state.

- [ ] `IA-02` Validate factory-authorized install/bootstrap on init.
  Done when:
  - the installing caller is checked against `factory_principal`
  - manual installs still work with fields omitted

- [ ] `IA-03` Publish versioned Wasm artifacts and manifest from `ic-automaton`.
  Done when:
  - `automaton-launchpad` can fetch or sync a single versioned artifact bundle
  - the bundle includes Wasm, Candid, 40-char commit SHA, and SHA-256

## Operational Tasks

- [ ] `OPS-01` Deploy the factory canister and derive the factory Base address.
- [ ] `OPS-02` Deploy `SpawnEscrow` with the derived factory address and fee recipient.
- [ ] `OPS-03` Fund the factory Base address with enough ETH for `release()` gas. *(Prerequisite for LP-10.)*
- [ ] `OPS-04` Upload the active `ic-automaton` artifact to the factory.
- [ ] `OPS-05` Configure the indexer with factory canister ID and IC host.
- [ ] `OPS-06` Run an end-to-end local or testnet spawn and capture timings for canister creation, install, ECDSA, and Base release broadcast.

## Validation Requirements

The project should not call this integration done until the following are all demonstrable.

- [ ] A session returns immutable payment instructions including `claimId`.
- [ ] A Base deposit updates factory session state without indexer escrow assistance.
- [ ] The factory installs a real `ic-automaton` canister from a configured artifact.
- [ ] The spawned automaton derives an EVM address and ends self-controlled; `canister_status` confirms `controllers == [automaton_canister_id]`.
- [ ] The factory records a release broadcast artifact for support/debugging.
- [ ] A dropped release tx is automatically re-broadcast without operator intervention.
- [ ] The indexer reads session and registry state from the factory and exposes canister ID to the web app via `SpawnSessionDetail.registryRecord`.
- [ ] Provider secrets are cleared from factory session state immediately after `install_code` succeeds or fails; they do not appear in audit entries, registry records, or indexer API responses.

## Main Risks and Open Issues

- `RISK-01` Cross-repo sequencing
  `LP-06` cannot truly complete before `IA-01` and `IA-02` land in `ic-automaton`.

- `RISK-02` Asset-scope inconsistency (mitigated by DEC-01)
  ETH variants removed in LP-01. Re-introduce only when a full ETH escrow path is specified.

- `RISK-03` Secret handling — security review required
  Provider API keys travel web app → indexer → factory → `ic-automaton`. The factory temporarily
  holds secrets in session state. Mandatory mitigations per DEC-02: clear secrets immediately after
  `install_code` succeeds (or before returning a failure), never persist across retry boundaries,
  never include in audit entries, registry records, health queries, or indexer API responses.
  Security review of the factory install path and the indexer redaction layer is mandatory before
  production deploy.

- `RISK-04` Retry semantics around release (mitigated by LP-10b)
  LP-07 ensures substep idempotency. LP-10b adds stuck-tx detection and re-broadcast.

- `RISK-05` Artifact lifecycle
  If the active Wasm is not stored in stable state, upgrade procedures become operationally fragile.
  LP-14 stores the artifact in stable state with upload-time integrity validation.

## Recommended Execution Order

1. ~~Lock DEC-01 through DEC-03~~ (done — see Locked Decisions above).
2. Complete `LP-01` and `LP-02` so the public contract stops drifting.
3. Complete `LP-03` through `LP-05` so the factory is a real canister with stable state.
4. Land `IA-01` through `IA-03` in `ic-automaton`.
5. Complete `LP-06` through `LP-14` to make spawn/payment/artifact flows real.
6. Complete `LP-15` through `LP-20` so the indexer and tests match the new architecture.
7. Execute `OPS-01` through `OPS-06`.

## Resolved Decisions Carried Forward

- Spawn logic belongs in the factory canister.
- The indexer remains a proxy/cache layer.
- `eth_getLogs` is the right payment-detection primitive.
- Delete-and-recreate is acceptable on install failure.
- Strategy/skill configuration stays out of install-time bootstrap.
- Final control should be self-only for the spawned automaton.
- `sessionId` is UUID v4, encoded as UTF-8 bytes for `claimId` derivation (DEC-04).
- `version_commit` is a 40-char lowercase git SHA (DEC-05).
