# Implementation Tasks

## Milestone 1: Shared Contracts and Project Skeleton

- [ ] Create `packages/shared/src/automaton.ts` with shared automaton/detail/monologue types.
- [ ] Create `packages/shared/src/spawn.ts` with spawn config, spawn session, quote, retry, refund, and registry types.
- [ ] Create `packages/shared/src/events.ts` with websocket and session event payload types.
- [ ] Create `packages/shared/src/catalog.ts` with strategy/skill catalog types.
- [ ] Scaffold `apps/web` with `src/main.tsx`, `src/App.tsx`, `src/styles.css`, and `src/theme/tokens.ts`.
- [ ] Scaffold `apps/indexer` with `src/server.ts`.
- [ ] Scaffold factory canister source under `backend/factory/src/`.

## Milestone 2: Frontend Core Experience

- [ ] Implement the home/grid surface in `apps/web/src/pages/HomePage.tsx`.
- [ ] Implement canvas rendering modules in `apps/web/src/components/grid/AutomatonCanvas.tsx`, `grid-renderer.ts`, `grid-animations.ts`, and `grid-hit-test.ts`.
- [ ] Implement the detail drawer in `apps/web/src/components/drawer/AutomatonDrawer.tsx`.
- [ ] Implement the monologue panel in `apps/web/src/components/drawer/MonologuePanel.tsx`.
- [ ] Implement the steward CLI panel in `apps/web/src/components/drawer/CommandLinePanel.tsx`.
- [ ] Implement CLI payload helpers in `apps/web/src/lib/cli-command-builder.ts`.
- [ ] Add steward-only post-spawn provider config commands in `apps/web/src/lib/cli-commands/provider-config.ts`.

## Milestone 3: Spawn Wizard and Session UX

- [ ] Implement the spawn wizard shell in `apps/web/src/components/spawn/SpawnWizard.tsx`.
- [ ] Add `ChainStep.tsx`, `RiskStep.tsx`, `StrategiesStep.tsx`, `SkillsStep.tsx`, `ProviderConfigStep.tsx`, and `FundStep.tsx` under `apps/web/src/components/spawn/steps/`.
- [ ] Add wizard state management in `apps/web/src/components/spawn/spawn-state.ts`.
- [ ] Make the wizard 6 steps while preserving the `mocks/mock-9.html` visual language.
- [ ] Validate the funding step against `$50` gross user payment.
- [ ] Show gross payment, platform fee, creation cost, and net forwarded amount in the funding summary.
- [ ] Add OpenRouter model loading in `apps/web/src/api/openrouter.ts`.
- [ ] Add curated fallback models in `apps/web/src/lib/default-models.ts`.
- [ ] Make `ProviderConfigStep.tsx` prefer dynamic OpenRouter models and fall back to the curated list.

## Milestone 4: Factory Canister Core

- [ ] Implement `backend/factory/src/types.rs` with session, quote, registry, audit, and config types.
- [ ] Implement `backend/factory/src/state.rs` with upgrade-safe storage for sessions, registry, fee config, creation-cost config, pause flag, and audit log.
- [ ] Implement public factory methods in `backend/factory/src/api/public.rs`.
- [ ] Implement admin factory methods in `backend/factory/src/api/admin.rs`.
- [ ] Implement factory entry wiring in `backend/factory/src/lib.rs`.
- [ ] Use a unique factory-issued `sessionId` as the primary correlation key.
- [ ] Bind each session to immutable quote terms or a `quoteTermsHash`.
- [ ] Enforce fixed global fee and fixed global creation-cost quote.
- [ ] Enforce session expiration and global pause behavior.

## Milestone 5: Escrow Integration

- [ ] Implement `backend/factory/src/escrow.rs` for the factory-to-escrow boundary.
- [ ] Model escrow claims by `sessionId` for `ETH` and `USDC` on `Base`.
- [ ] Ensure underpayment remains `awaiting_payment` until expiration.
- [ ] Ensure expired unresolved sessions become user-refundable.
- [ ] Ensure paid claims cannot be reused across sessions.
- [ ] Ensure payment status can drive factory session progression deterministically.

## Milestone 6: Spawn Execution and Controller Handoff

- [ ] Implement spawn pipeline in `backend/factory/src/spawn.rs`.
- [ ] Implement init/config handoff in `backend/factory/src/init.rs`.
- [ ] Implement controller handoff in `backend/factory/src/controllers.rs`.
- [ ] Create the automaton canister after valid payment is confirmed.
- [ ] Pass chain, risk, strategies, skills, and optional provider config into automaton initialization.
- [ ] Retain provider secrets only long enough to survive retryable init/spawn failures.
- [ ] Clear provider secrets after successful completion or irrevocable refund.
- [ ] Forward net funds to the spawned automaton EVM address after deducting fee and creation cost.
- [ ] Credit overpayment to the spawned automaton.
- [ ] Ensure the spawned automaton ends self-controlled and the factory is no longer a controller.

## Milestone 7: Retry, Expiry, Refund, and Audit

- [ ] Implement retry logic in `backend/factory/src/retry.rs`.
- [ ] Implement expiry handling in `backend/factory/src/expiry.rs`.
- [ ] Allow retry by both user and admin.
- [ ] Bound retry by the original session expiration window.
- [ ] Allow user refund claims after expiration for unresolved sessions.
- [ ] Handle paid-but-failed spawn sessions as retryable until expiration, then refundable.
- [ ] Record auditable session state transitions for all lifecycle changes.

## Milestone 8: Indexer and Backend Status Surface

- [ ] Add public REST routes in `apps/indexer/src/routes/automatons.ts`, `catalog.ts`, and `health.ts`.
- [ ] Add websocket event handling in `apps/indexer/src/ws/events.ts`.
- [ ] Add SQLite persistence in `apps/indexer/src/store/sqlite.ts` and `schema.sql`.
- [ ] Implement polling in `apps/indexer/src/polling/fast-poll.ts`, `slow-poll.ts`, and `prices.ts`.
- [ ] Implement normalization in `apps/indexer/src/normalize/automaton-record.ts` and `monologue.ts`.
- [ ] Implement derived-data helpers in `apps/indexer/src/lib/grid-position.ts`, `name-generator.ts`, and `ens-cache.ts`.
- [ ] Add factory integration client in `apps/indexer/src/integrations/factory-client.ts`.
- [ ] Add escrow integration client in `apps/indexer/src/integrations/escrow-client.ts`.
- [ ] Add spawn-session status route in `apps/indexer/src/routes/spawn-sessions.ts`.
- [ ] Expose normalized session state for frontend consumption through the indexer/backend path.
- [ ] Expose factory registry records for automaton discovery.
- [ ] Keep temporary spawn-session state separate from the public automaton list API.

## Milestone 9: Frontend Data Wiring

- [ ] Add frontend API clients in `apps/web/src/api/indexer.ts`, `spawn.ts`, `catalog.ts`, and `ws.ts`.
- [ ] Add data hooks in `apps/web/src/hooks/useAutomatons.ts`, `useAutomatonDetail.ts`, and `useSpawnSession.ts`.
- [ ] Model session states including `awaiting_payment`, `payment_detected`, `spawning`, `funding_automaton`, `complete`, `failed`, and `expired`.
- [ ] Wire the wizard to create spawn sessions, display escrow payment instructions, and poll/subscribe to status updates.
- [ ] Show retry and refund-eligible states in the frontend flow.
- [ ] Ensure new automatons appear in the grid only after spawn completes.

## Milestone 10: Deferred and Future-Compatible Work

- [ ] Keep parent-child fields in the factory registry schema, even if mostly `null` initially.
- [ ] Defer semantic strategy/skill validation until a dedicated repository canister exists.
- [ ] Keep the session and registry model compatible with a future strategy/skill repository canister.
- [ ] Keep the product-level “configure later via steward CLI” path aligned with the provider-config spawn inputs.
