# Rolling Handoff

## Core Rules
- Source of truth:
  - `specs/SPEC.md`
  - `specs/SPEC-INDEXER.md`
  - `specs/SPEC-FACTORY.md`
- Fixed stack:
  - `npm` workspaces
  - `React + Vite + TypeScript` for `apps/web`
  - `Fastify + TypeScript` for `apps/indexer`
  - `Rust` for `backend/factory`
  - `Vitest` for TypeScript tests
- Locked factory/payment constraints:
  - escrow-backed payment flow
  - factory-issued `sessionId`
  - fixed fee
  - fixed creation-cost quote for session lifetime
  - retry allowed for user and admin
  - refund after expiration for unresolved sessions
  - spawned automaton must end self-controlled
  - factory must not remain a controller

## Operating Policy
- Every milestone runs in a fresh Codex session and must append only high-signal changes here.
- Missing packages or CLI tools are not a reason to add workarounds; install the normal prerequisite or stop and record a blocker.
- When adding or upgrading third-party packages, verify the latest stable version from the official package source at the time of the change and prefer the spec-aligned dependency.
- Preserve root validation entrypoints:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`

## Current Baseline

### M01 Bootstrap workspace and validation harness
- Root workspace, validation scripts, `.nvmrc`, and Ralph loop environment handling are in place.
- Use the repo root for all npm workspace operations.
- The Ralph loop now fails fast on missing prerequisites instead of emulating absent tools.

### M02 Shared contracts
- `packages/shared/src/` is the single schema surface for automatons, spawn sessions, realtime events, and catalogs.
- Keep the temporary compatibility surface that exposes both `corePattern` and `corePatternIndex` until the public API naming is finalized.

### M03-M05 Frontend shell, grid, and spawn wizard
- `apps/web/src/App.tsx`, `apps/web/src/styles.css`, and `apps/web/src/theme/tokens.ts` are the main frontend extension points.
- Keep using the existing React + CSS approach unless the spec explicitly requires a stack change.
- The spawn wizard state in `apps/web/src/components/spawn/spawn-state.ts` is temporary frontend-only scaffolding and should be replaced with real session data later rather than treated as a backend contract.

### M06 Indexer foundation
- The spec requires Fastify with `@fastify/websocket` and SQLite via `better-sqlite3`.
- The current implementation diverges from that plan: it uses a manual websocket path and a `sqlite3` CLI-backed store.
- `M06` is already completed in Ralph state, so do not reopen it; carry the required spec realignment inside `M08` before further integration work proceeds.
- Keep the current route and contract surface stable while swapping the internals:
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/src/routes/automatons.ts`
  - `apps/indexer/src/routes/realtime.ts`
  - `apps/indexer/src/store/sqlite.ts`
  - `apps/indexer/src/ws/events.ts`

### M07 Factory session core
- `backend/factory/src/types.rs`, `backend/factory/src/state.rs`, and `backend/factory/src/api/` define the current factory contract surface.
- Keep the snapshot/restore seam intact until real IC stable-memory/runtime integration is added.
- Factory validation must stay green under `cargo fmt --check -p factory` and `cargo clippy -p factory --all-targets -- -D warnings`.

## Read First In The Next Session
- `prompt.md`
- `tasks.md`
- `ralph/reports/M12.md`
- `packages/shared/src/spawn.ts`
- `apps/indexer/src/routes/spawn-sessions.ts`
- `apps/web/src/hooks/useSpawnSession.ts`
- `backend/factory/src/lib.rs`
- `ralph/notes/rolling-handoff.md`

## 2026-03-10 M08 Implement escrow integration and spawn execution
- Added the factory escrow claim boundary and spawn execution pipeline in `backend/factory/src/escrow.rs`, `backend/factory/src/spawn.rs`, `backend/factory/src/controllers.rs`, and `backend/factory/src/init.rs`.
- Important constraint discovered: the environment cannot reach `registry.npmjs.org`; `npm install --workspace @ic-automaton/indexer @fastify/websocket@latest better-sqlite3@latest` fails with `getaddrinfo ENOTFOUND`, so the spec-required indexer realignment is still blocked.
- Factory interfaces/contracts modified:
  - session creation now also creates an escrow claim keyed by `sessionId` and `quoteTermsHash`
  - paid escrow synchronization can advance sessions to `payment_detected`
  - spawn execution now records runtime/controller state, forwards the net amount in bookkeeping, inserts the registry record, clears provider secrets on success, and finishes with the spawned automaton as sole controller
- Validation commands that proved the factory side:
  - `test -f backend/factory/src/escrow.rs`
  - `test -f backend/factory/src/spawn.rs`
  - `test -f backend/factory/src/controllers.rs`
  - `test -f backend/factory/src/init.rs`
  - `rg "sessionId|funding_automaton|controller|quoteTermsHash" backend/factory/src`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M08.md`
  - `apps/indexer/package.json`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/store/sqlite.ts`
  - `apps/indexer/src/routes/realtime.ts`
  - `specs/SPEC-INDEXER.md`

## 2026-03-10 M08 Implement escrow integration and spawn execution
- Completed the spec-required indexer realignment: `apps/indexer/src/server.ts` now registers `@fastify/websocket`, `apps/indexer/src/routes/realtime.ts` serves the same path with HTTP plus `wsHandler`, `apps/indexer/src/ws/events.ts` manages real websocket clients, and `apps/indexer/src/store/sqlite.ts` now uses `better-sqlite3` instead of shelling out to `sqlite3`.
- Important constraint discovered: the earlier registry-access blocker was stale for this workspace because the required packages were already present in `apps/indexer/package.json`, `package-lock.json`, and `node_modules`; no fallback implementation was needed.
- Interfaces/contracts introduced or modified:
  - the factory session flow remains keyed by `sessionId` and `quoteTermsHash`, and successful spawn completion still ends with the automaton as the sole controller
  - the indexer keeps the existing `/ws/events` HTTP `426 Upgrade Required` response while also supporting live websocket upgrades on the same route
  - store health now reports the spec-aligned `better-sqlite3` driver
- Validation commands that proved the milestone:
  - `test -f backend/factory/src/escrow.rs`
  - `test -f backend/factory/src/spawn.rs`
  - `test -f backend/factory/src/controllers.rs`
  - `test -f backend/factory/src/init.rs`
  - `rg "@fastify/websocket|better-sqlite3" apps/indexer/package.json`
  - `rg "@fastify/websocket|better-sqlite3" apps/indexer/src`
  - `rg "sessionId|funding_automaton|controller|quoteTermsHash" backend/factory/src`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M08.md`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/routes/realtime.ts`
  - `apps/indexer/src/store/sqlite.ts`
  - `apps/indexer/src/ws/events.ts`
  - `specs/SPEC-INDEXER.md`

## 2026-03-10 M09 Implement retry, expiry, refund, and secret lifecycle
- Added `backend/factory/src/retry.rs` and `backend/factory/src/expiry.rs`, then wired steward/admin retry plus steward refund flows through `backend/factory/src/api/public.rs`, `backend/factory/src/api/admin.rs`, `backend/factory/src/escrow.rs`, and `backend/factory/src/spawn.rs`.
- Important constraints discovered:
  - the locked shared session enum still ends at `expired`, so refund completion is represented by keeping `state = expired`, switching `payment_status = refunded`, and appending an audit entry instead of inventing a new terminal session state
  - provider secrets must survive retryable failures, so cleanup now happens only on success or irreversible refund
- Interfaces/contracts introduced or modified:
  - public factory surface now includes steward retry and refund entrypoints
  - admin factory surface now includes admin retry
  - failed, expired, retried, and refunded transitions all append explicit audit entries
  - expiry now sets refund eligibility on paid/partial unresolved sessions, and refund cleanup also clears provider keys and removes lingering factory control from any retained runtime
- Validation commands that proved the milestone:
  - `test -f backend/factory/src/retry.rs`
  - `test -f backend/factory/src/expiry.rs`
  - `rg "retryable|refundable|expired|openRouterApiKey|braveSearchApiKey" backend/factory/src`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M09.md`
  - `backend/factory/src/retry.rs`
  - `backend/factory/src/expiry.rs`
  - `backend/factory/src/escrow.rs`
  - `backend/factory/src/api/public.rs`
  - `backend/factory/src/api/admin.rs`
  - `specs/SPEC-FACTORY.md`

## 2026-03-10 M10 Integrate factory and escrow status into the indexer
- Added `apps/indexer/src/routes/spawn-sessions.ts` plus `apps/indexer/src/integrations/factory-client.ts` and `apps/indexer/src/integrations/escrow-client.ts` so the backend can expose normalized spawn-session reads and spawned-automaton registry discovery without mixing them into `/api/automatons`.
- Important constraints discovered:
  - the indexer needs two TypeScript resolution modes: source-based `@ic-automaton/shared` paths for lint/tests and built shared declarations for `apps/indexer/tsconfig.build.json`, otherwise `npm run build` fails on `rootDir`
  - the new factory/escrow clients are injectable seams; this milestone did not hard-code a live IC or escrow transport because the repo still lacks concrete wire bindings
- Interfaces/contracts introduced or modified:
  - shared spawn contracts now include `EscrowPaymentRecord` and `SpawnSessionDetail`
  - SQLite persistence now has separate `spawn_sessions` and `spawned_automaton_registry` caches
  - websocket subscriptions now support optional `sessionId` filtering in addition to `canisterId`
- Validation commands that proved the milestone:
  - `test -f apps/indexer/src/routes/spawn-sessions.ts`
  - `test -f apps/indexer/src/integrations/factory-client.ts`
  - `test -f apps/indexer/src/integrations/escrow-client.ts`
  - `rg "spawn-session|sessionId|factory|escrow" apps/indexer/src`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M10.md`
  - `apps/indexer/src/routes/spawn-sessions.ts`
  - `apps/indexer/src/integrations/factory-client.ts`
  - `apps/indexer/src/integrations/escrow-client.ts`
  - `apps/indexer/src/store/sqlite.ts`
  - `packages/shared/src/spawn.ts`

## 2026-03-10 M11 Wire frontend data flows and steward provider commands
- Added real frontend API/hook seams in `apps/web/src/api/` and `apps/web/src/hooks/` so the app now reads automaton lists, automaton detail, and spawn-session status from the indexer instead of the local automaton fixture surface.
- Important constraints discovered:
  - the frontend needed indexer-side POST proxy routes for session create/retry/refund in `apps/indexer/src/routes/spawn-sessions.ts`; read-only session routes were not enough to support the locked retry/refund UX
  - the default indexer factory client remains unconfigured, so live create/retry/refund requests still require a future concrete IC/factory transport adapter or the routes return `503`
- Interfaces/contracts introduced or modified:
  - web app now relies on `apps/web/src/api/spawn.ts` plus `apps/web/src/hooks/useSpawnSession.ts` for `sessionId`-scoped polling/websocket tracking, quote retention, and retry/refund actions
  - indexer `FactoryClient` now exposes create/retry/refund seams in addition to session/registry reads
  - steward CLI now supports staged provider commands for OpenRouter API key, inference model, and Brave Search API key through `apps/web/src/lib/cli-command-builder.ts` and `apps/web/src/lib/cli-commands/provider-config.ts`
- Validation commands that proved the milestone:
  - `test -f apps/web/src/api/spawn.ts`
  - `test -f apps/web/src/hooks/useSpawnSession.ts`
  - `test -f apps/web/src/lib/cli-commands/provider-config.ts`
  - `rg "sessionId|retry|refund|OpenRouter|Brave" apps/web/src`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M11.md`
  - `apps/web/src/api/indexer.ts`
  - `apps/web/src/api/spawn.ts`
  - `apps/web/src/api/ws.ts`
  - `apps/web/src/hooks/useAutomatons.ts`
  - `apps/web/src/hooks/useAutomatonDetail.ts`
  - `apps/web/src/hooks/useSpawnSession.ts`
  - `apps/web/src/lib/cli-command-builder.ts`
  - `apps/web/src/lib/cli-commands/provider-config.ts`
  - `apps/indexer/src/routes/spawn-sessions.ts`
  - `apps/indexer/src/integrations/factory-client.ts`

## 2026-03-10 M12 System hardening and final verification
- Re-ran the full M12 smoke/lint/build/test/factory validation suite and confirmed the repository is already green without further application-code changes.
- Important constraints discovered:
  - the earlier M08 npm-registry/network blocker is historical only; this workspace validates successfully with the dependencies already present
  - the default indexer factory transport is still an injectable seam rather than a live IC adapter, but that is unchanged and did not block the locked M12 verification scope
- Interfaces/contracts introduced or modified:
  - no product interfaces changed in M12; the verified contract surfaces remain the shared spawn-session model, the indexer spawn-session routes, the frontend `useSpawnSession` flow, and the factory session/controller lifecycle
- Validation commands that proved the milestone:
  - `rg "spawn session|quoteTermsHash|retryable|refundable" -g '!ralph/**' .`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next milestone must read first:
  - `ralph/reports/M12.md`
- `packages/shared/src/spawn.ts`
- `apps/indexer/src/routes/spawn-sessions.ts`
- `apps/web/src/hooks/useSpawnSession.ts`
- `backend/factory/src/lib.rs`
- `ralph/notes/rolling-handoff.md`

## 2026-03-10 Single automaton live indexer notes
- If the next session touches the local live-automaton ingestion path, read these first:
  - `ralph/notes/single-automaton-e2e-checklist.md`
  - `apps/indexer/src/indexer.config.ts`
  - `apps/indexer/src/integrations/automaton-client.ts`
  - `apps/indexer/src/polling/automaton-indexer.ts`
  - `apps/indexer/src/normalize/automaton.ts`
  - `apps/indexer/src/lib/automaton-derived.ts`
  - `apps/indexer/src/routes/health.ts`
- The real canister contract was taken from the sibling repo `/Users/domwoe/Dev/projects/ic-automaton`, not inferred from this workspace.
- Fastest orientation paths in that sibling repo:
  - `ic-automaton.did`
  - `docs/debugging-live-canister.md`
  - `.icp/cache/mappings/local.ids.json`
  - `.icp/cache/networks/local/descriptor.json`
- The indexer no longer uses the deprecated direct `@dfinity/*` path for this work. Use `@icp-sdk/core@4.2.3` and import from `@icp-sdk/core/agent` plus `@icp-sdk/core/candid`.
- The live ingestion path depends on both canister HTTP endpoints and a small Candid actor surface. If one side looks incomplete, check `apps/indexer/src/integrations/automaton-client.ts` before debugging normalization or storage.
- The fastest runtime sanity check is `/health`:
  - confirm `discovery.seedCanisterIds`
  - confirm `polling.live.canisters[canisterId]`
  - confirm `polling.live.price`
- One unresolved limitation from the implementation session: validation was green, but the sandbox did not prove a full loop against a running local replica on `localhost:8000`. Re-run that manually before treating the local live path as fully verified.

## 2026-03-10 Single automaton realtime notes
- Read these first before touching websocket behavior:
  - `apps/indexer/src/polling/automaton-indexer.ts`
  - `apps/indexer/src/lib/automaton-record.ts`
  - `apps/indexer/src/ws/events.ts`
  - `apps/indexer/src/routes/realtime.ts`
  - `apps/indexer/test/polling.test.ts`
  - `apps/indexer/test/realtime.test.ts`
- The poller now emits realtime events directly through an injected `eventPublisher`, and `buildServer()` binds that publisher to the existing `RealtimeHub`.
- `update` events are driven by `AutomatonDetail -> AutomatonRecord` diffs, not by blind “poll succeeded” notifications.
- Important trap: `lastPolledAt` must not participate in the update diff, and identity-only polls must not reset the existing survival tier. Both mistakes cause noisy `update` events on every cycle.
- `monologue` events are emitted only for unseen turns after comparing the live recent-turn window with SQLite before the monologue upsert.
- `apps/indexer/test/realtime.test.ts` is a real websocket integration test. It requires binding a localhost listener, so sandboxed validation may need escalation even though the code itself is fine.

## 2026-03-10 S01-add-a-dedicated-indexer-config-file-as-the-singl
- Added `apps/indexer/src/indexer.config.ts` as the dedicated typed source of truth for single-automaton ingestion targeting:
  - `canisterIds` now defaults to `["txyno-ch777-77776-aaaaq-cai"]`
  - `network.target` now defaults to `local`
  - `network.local` now defaults to `localhost:8000`
- Important constraints discovered:
  - the repo already had an indexer runtime resolver in `apps/indexer/src/config.ts`, so the lowest-risk change was to make that file consume a dedicated target-config module rather than inventing a second startup path
  - `icHost` can now be derived from the typed target config, which removes the earlier split between seed-canister env vars and raw host env vars for this checklist item
- Interfaces/contracts introduced or modified:
  - `IndexerConfig` now carries `ingestion: IndexerTargetConfig` instead of storing canister IDs directly on the top-level config object
  - `apps/indexer/src/config.ts` now derives `icHost` from `network.target` and `network.local`
  - `/health` still reports the configured canister list through `discovery.seedCanisterIds`, but that value now comes from the dedicated target config
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/indexer.config.ts`
  - `apps/indexer/src/config.ts`
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/test/config.test.ts`
  - `ralph/reports/checklists/S01-add-a-dedicated-indexer-config-file-as-the-singl.md`

## 2026-03-10 S01-keep-the-config-shape-small-and-typed-do-not-spl
- Confirmed the active indexer runtime already satisfies the config-shape constraint:
  - `apps/indexer/src/indexer.config.ts` remains the single typed source for `canisterIds` and `network`
  - `apps/indexer/src/config.ts` keeps that target shape nested under `ingestion` and derives `icHost` from `network.target` plus `network.local`
- Important constraint discovered:
  - the only stale split-targeting surface left for this item was documentation drift in `README.md`; runtime code was already aligned
- Interfaces/contracts introduced or modified:
  - no runtime interface changes were needed for this item
  - local operator guidance now points to `apps/indexer/src/indexer.config.ts` instead of the removed split targeting env vars
- Validation commands that proved the item:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/indexer.config.ts`
- `apps/indexer/src/config.ts`
- `apps/indexer/test/config.test.ts`
- `README.md`
- `ralph/reports/checklists/S01-keep-the-config-shape-small-and-typed-do-not-spl.md`

## 2026-03-10 S01-validate-config-at-startup-with-clear-error-mess
- Added explicit ingestion-config validation in `apps/indexer/src/config.ts` so startup now fails early with clear messages for:
  - empty `canisterIds`
  - invalid canister ID format
  - unsupported `network.target`
  - missing local `host` or `port` when `target = local`
- Important constraints discovered:
  - the workspace does not already ship a DFINITY principal parser, so canister ID validation was implemented locally with canonical base32 decoding plus CRC32 checksum verification instead of adding a new dependency
  - `buildServer()` had to move inside the `start()` `try` block in `apps/indexer/src/server.ts` so invalid startup config is reported cleanly before `listen()` runs
- Interfaces/contracts introduced or modified:
  - no config shape changes were introduced; `apps/indexer/src/indexer.config.ts` remains the single typed source of truth
  - `resolveIndexerConfig()` now enforces runtime validity before returning `IndexerConfig`
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/indexer.config.ts`
  - `apps/indexer/src/config.ts`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/test/config.test.ts`
  - `ralph/reports/checklists/S01-validate-config-at-startup-with-clear-error-mess.md`

## 2026-03-10 S01-support-environment-overrides-only-for-deploymen
- Added bounded ingestion env overrides in `apps/indexer/src/config.ts` for deployment/runtime concerns only:
  - `INDEXER_INGESTION_NETWORK_TARGET`
  - `INDEXER_INGESTION_LOCAL_HOST`
  - `INDEXER_INGESTION_LOCAL_PORT`
- Important constraints discovered:
  - `canisterIds` must remain sourced from `apps/indexer/src/indexer.config.ts`; this item did not reintroduce any env-based canister registration path
  - invalid env overrides should fail through the same startup validation path as invalid file config, so the resolver now merges env values before `validateTargetConfig()` runs
- Interfaces/contracts introduced or modified:
  - `resolveIndexerConfig()` now applies env overrides to `ingestion.network.target` and `ingestion.network.local`
  - `README.md` now documents the allowed runtime override surface and explicitly states that the config file remains the default source of truth
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/indexer.config.ts`
  - `apps/indexer/src/config.ts`
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/test/config.test.ts`
  - `README.md`
  - `ralph/reports/checklists/S01-support-environment-overrides-only-for-deploymen.md`

## 2026-03-10 S01-make-startup-fail-clearly-when-the-canister-list
- Verified the current indexer runtime already satisfies the startup-failure requirement without another source patch:
  - `apps/indexer/src/config.ts` still throws the explicit invalid-ingestion errors for empty canister lists and unsupported network targets
  - `apps/indexer/src/server.ts` still formats those failures as a startup abort with config-file and env-override guidance before `listen()` runs
  - `apps/indexer/test/server.test.ts` already proves both the empty canister list case and the invalid `INDEXER_INGESTION_NETWORK_TARGET` subprocess case
- Important constraint discovered:
  - this checklist item was already implemented by the earlier S01 config/server work, so the correct move was verification plus Ralph artifact updates only, not another runtime change that would overlap the next `/health` item
- Interfaces/contracts introduced or modified:
  - no runtime interfaces changed for this item
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/config.ts`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/test/config.test.ts`
  - `apps/indexer/test/server.test.ts`
  - `ralph/reports/checklists/S01-make-startup-fail-clearly-when-the-canister-list.md`

## 2026-03-10 S01-surface-the-configured-canister-list-and-target
- Extended `apps/indexer/src/routes/health.ts` so `/health` now reports both the configured `seedCanisterIds` and the effective ingestion target as `discovery.targetNetwork`.
- Important constraint discovered:
  - the route already exposed the canister list, so the lowest-risk change was to add only the missing target-network surface instead of reshaping the broader health payload ahead of later polling/debug checklist items
- Interfaces/contracts introduced or modified:
  - `/health` now returns `discovery.targetNetwork.target`
  - `/health` now returns `discovery.targetNetwork.icHost`
  - `/health` now returns `discovery.targetNetwork.localReplica`, with `{ host, port }` for local mode and `null` for mainnet
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/routes/health.ts`
  - `apps/indexer/test/server.test.ts`
  - `apps/indexer/src/config.ts`
  - `apps/indexer/src/indexer.config.ts`
  - `ralph/reports/checklists/S01-surface-the-configured-canister-list-and-target.md`

## 2026-03-10 S01-load-the-configured-canister-id-list-on-startup
- Loaded the configured ingestion target list into a durable startup registry by adding `configured_canisters` storage in `apps/indexer/src/store/schema.sql` and sync/list methods in `apps/indexer/src/store/sqlite.ts`.
- Important constraints discovered:
  - the existing `automatons` table is for normalized indexed snapshots, so startup target loading had to stay separate from public automaton reads until real polling exists
  - the registry sync must replace only config-seeded entries, so the seam is forward-compatible with future manual or factory-backed discovery sources
- Interfaces/contracts introduced or modified:
  - `IndexerStore` now exposes `syncConfiguredCanisterIds()` and `listConfiguredCanisterIds()`
  - `apps/indexer/src/server.ts` now seeds `indexerConfig.ingestion.canisterIds` during `onReady`
  - store health counts now include `configuredCanisters`
- Validation commands that proved the item:
  - `npm --workspace @ic-automaton/indexer run lint`
  - `npm --workspace @ic-automaton/indexer run test -- sqlite.test.ts server.test.ts`
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- References the next checklist items must read first:
  - `apps/indexer/src/store/schema.sql`
  - `apps/indexer/src/store/sqlite.ts`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/test/sqlite.test.ts`
  - `apps/indexer/test/server.test.ts`
  - `ralph/reports/checklists/S01-load-the-configured-canister-id-list-on-startup.md`
