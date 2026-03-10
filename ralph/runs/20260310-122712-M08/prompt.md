# Ralph Loop Implementation Prompt

You are executing exactly one milestone in a milestone-based implementation loop.

The runner will append:
- the current milestone definition
- the list of required context files
- the cumulative rolling handoff
- the required validation commands

## Mission

Complete exactly the current milestone. Do not start future milestones unless a tiny amount of forward-compatible setup is strictly required to keep the current milestone buildable and testable.

## Non-negotiable operating rules

- Read every file listed in the current milestone's `reads` set before editing.
- Treat the locked specs in `specs/` as the source of truth.
- Treat `tasks.md` as the high-level implementation map.
- Treat `ralph/notes/rolling-handoff.md` as required context from prior sessions.
- Use fresh-context discipline: assume no memory outside the files in this repo and the milestone payload provided by the runner.
- Keep the stack consistent across milestones:
  - package manager: `npm` workspaces
  - frontend: `React + Vite + TypeScript`
  - backend API/indexer: `Fastify + TypeScript`
  - shared contracts: `TypeScript`
  - factory canister: `Rust`
  - TS test runner: `Vitest`
- Prefer root-level scripts that keep validation stable across milestones:
  - `npm run lint`
  - `npm run build`
  - `npm run test`
  - `npm run lint:factory`
  - `npm run test:factory`
- The factory Rust module must stay green under:
  - `cargo fmt --check -p factory`
  - `cargo clippy -p factory --all-targets -- -D warnings`
- Do not invent alternative product behavior when the specs already decide it.
- Do not fake validation by adding no-op scripts, empty tests, `true`, or placeholder commands that always pass.
- Do not silently weaken tests to make the milestone pass.
- If a required validation fails, either fix it inside the milestone scope or stop and record a blocker.
- If the specs conflict, stop and record the conflict clearly in the milestone report and rolling handoff.

## Scope control

- Work only on files needed for the current milestone.
- Keep interfaces stable and documented for later milestones.
- Avoid broad refactors unless they are required to make the current milestone correct.
- If you need to make a cross-cutting decision not already fixed by the specs, document it in the milestone report and rolling handoff.

## Required outputs before you finish

You must update both files below before ending the session:

1. `ralph/reports/<MILESTONE_ID>.md`
2. `ralph/notes/rolling-handoff.md`

## Required milestone report format

Write `ralph/reports/<MILESTONE_ID>.md` using this structure:

```md
# <MILESTONE_ID> <TITLE>

## Outcome
- completed work

## Files Changed
- path

## Validation Run
- command: result

## Learnings
- decisions or discoveries that affect later work

## References for Next Milestones
- file paths, commands, or contracts future sessions must read/use

## Open Issues
- blockers, caveats, or follow-up items
```

## Required rolling handoff update

Append a new dated section to `ralph/notes/rolling-handoff.md`:

```md
## YYYY-MM-DD <MILESTONE_ID> <TITLE>
- What changed
- Important constraints discovered
- Interfaces/contracts introduced or modified
- Validation commands that proved the milestone
- References the next milestone must read first
```

Keep the handoff concise and cumulative. It should help the next fresh session without duplicating entire reports.

## Validation

- Run every validation command listed for the current milestone.
- Record the exact commands and outcomes in the milestone report.
- If a command cannot be run because the environment is missing a prerequisite, record that explicitly as a blocker instead of pretending success.

## Final response

End with a short status:
- `COMPLETED` if the milestone is done and validations passed
- `BLOCKED` if you could not complete it

Also mention:
- the key files changed
- the validation summary
- any blocker that should stop the next loop iteration

---

## Current Milestone Payload

- MILESTONE_ID: `M08`
- TITLE: Implement escrow integration and spawn execution
- GOAL: Connect factory session logic to escrow claims, execute spawn after valid payment, initialize the automaton, forward funds, and complete controller handoff.

### Required Reads
- `specs/SPEC-FACTORY.md`
- `tasks.md`
- `prompt.md`
- `ralph/notes/rolling-handoff.md`

### Required Validation Commands
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

### Already Completed Milestones
- `M01`
- `M02`
- `M03`
- `M04`
- `M05`
- `M06`
- `M07`

## Rolling Handoff Content

# Rolling Handoff

## Initial constraints
- Source of truth:
  - `specs/SPEC.md`
  - `specs/SPEC-INDEXER.md`
  - `specs/SPEC-FACTORY.md`
- Visual direction is fixed by `mocks/mock-9.html` as a system reference, not as an exact implementation artifact.
- The stack is fixed for implementation consistency:
  - `npm` workspaces
  - `React + Vite + TypeScript` for `apps/web`
  - `Fastify + TypeScript` for `apps/indexer`
  - `Rust` for `backend/factory`
  - `Vitest` for TS tests
- Factory/payment constraints already locked:
  - escrow-backed payment flow
  - unique factory-issued `sessionId` correlation
  - fixed fee
  - fixed global creation-cost quote
  - quote guaranteed for session lifetime
  - retry allowed for user and admin
  - refund after expiration for unresolved sessions
  - spawned automaton must end self-controlled
  - factory must not remain a controller

## Usage expectations for future milestones
- Every milestone runs in a fresh Codex session.
- Every milestone must append new learnings here.
- Keep this file concise and cumulative.
- Record only information that should shape later implementation or prevent drift.

## References for early milestones
- `tasks.md`
- `prompt.md`
- `ralph/milestones.json`

## 2026-03-10 M01 Bootstrap workspace and validation harness
- Added the monorepo skeleton: root `npm` workspace scripts, `packages/shared` contracts, `apps/web` React/Vite scaffold, `apps/indexer` Fastify scaffold, and the Rust `backend/factory` crate plus workspace root.
- Shared TypeScript contracts now define automaton, spawn-session, realtime-event, and catalog interfaces aligned with the locked specs; later milestones should extend these instead of redefining shapes locally.
- The baseline backend surface is `apps/indexer/src/server.ts` with an injectable Fastify builder and `/health` route; the baseline frontend surface is `apps/web/src/App.tsx`.
- Validation that proved the milestone: `test -f package.json`, `test -f Cargo.toml`, `test -f apps/web/package.json`, `test -f apps/indexer/package.json`, `test -f backend/factory/Cargo.toml`, `cargo fmt --check`, and `cargo test --workspace` passed.
- Important blocker at that time: `npm install` had not completed in the earlier run and npm-based validation was unavailable. Superseded by the later 2026-03-10 M01 rerun below, where `npm install`, `npm run lint`, `npm run build`, and `npm run test` all passed.
- Read `ralph/reports/M01.md`, `package.json`, `packages/shared/src/spawn.ts`, `apps/indexer/src/server.ts`, and `apps/web/src/App.tsx` first in the next session.

## 2026-03-10 M01 Bootstrap workspace and validation harness
- Re-ran the full M01 validation suite after successfully completing `npm install`; the earlier npm blocker is obsolete.
- The workspace now has a root `package-lock.json`, and the stable validation entrypoints are confirmed working end to end from the repository root.
- Shared TypeScript contracts remain the baseline interface surface for spawn sessions, realtime events, automaton records, and catalogs; keep extending those files instead of forking types in apps.
- Validation commands that proved the milestone: `test -f package.json`, `test -f Cargo.toml`, `test -f apps/web/package.json`, `test -f apps/indexer/package.json`, `test -f backend/factory/Cargo.toml`, `npm install`, `npm run lint`, `npm run build`, `npm run test`, `cargo fmt --check`, and `cargo test --workspace`.
- Read `ralph/reports/M01.md`, `package.json`, `package-lock.json`, `packages/shared/src/spawn.ts`, `apps/indexer/src/server.ts`, and `apps/web/src/App.tsx` first in the next session.

## 2026-03-10 M01 Bootstrap workspace and validation harness
- Revalidated the existing M01 scaffold without further product-code edits; the current repository state already matches the locked milestone scope.
- Important constraint confirmed: later milestones should preserve the root validation harness and extend shared contracts in `packages/shared/src/` instead of redefining interface shapes per app.
- Interfaces/contracts still serving as the baseline are the shared automaton/spawn/event/catalog types, the indexer Fastify builder in `apps/indexer/src/server.ts`, and the frontend bootstrap surface in `apps/web/src/App.tsx`.
- Validation commands that proved the milestone: `test -f package.json`, `test -f Cargo.toml`, `test -f apps/web/package.json`, `test -f apps/indexer/package.json`, `test -f backend/factory/Cargo.toml`, `npm install`, `npm run lint`, `npm run build`, `npm run test`, `cargo fmt --check`, and `cargo test --workspace`.
- Read `ralph/reports/M01.md`, `package.json`, `package-lock.json`, `packages/shared/src/spawn.ts`, `packages/shared/src/automaton.ts`, `apps/indexer/src/server.ts`, `apps/web/src/App.tsx`, and `backend/factory/src/lib.rs` first in the next session.

## 2026-03-10 M01 Bootstrap workspace and validation harness
- Re-ran the entire locked M01 validation suite in the current workspace and confirmed the existing scaffold still passes without product-code edits.
- Important constraint confirmed again: preserve the root validation harness and extend `packages/shared/src/` contracts in place instead of introducing app-local copies or alternate scripts.
- Baseline interfaces/surfaces remain the shared automaton/spawn/event/catalog contracts, `apps/indexer/src/server.ts`, `apps/web/src/App.tsx`, and `backend/factory/src/lib.rs`.
- Validation commands that proved the milestone: `test -f package.json`, `test -f Cargo.toml`, `test -f apps/web/package.json`, `test -f apps/indexer/package.json`, `test -f backend/factory/Cargo.toml`, `npm install`, `npm run lint`, `npm run build`, `npm run test`, `cargo fmt --check`, and `cargo test --workspace`.
- Read `ralph/reports/M01.md`, `package.json`, `package-lock.json`, `packages/shared/src/index.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/automaton.ts`, `apps/indexer/src/server.ts`, `apps/web/src/App.tsx`, and `backend/factory/src/lib.rs` first in the next session.

## 2026-03-10 M02 Implement shared contracts
- Expanded `packages/shared/src/` into the stable schema layer for later milestones: automaton list/detail/monologue payloads, spawn quote/session/status/audit/registry payloads, realtime websocket events, and strategy/skill catalog records.
- Important constraint discovered: `SPEC.md` names `corePattern` while `SPEC-INDEXER.md` later uses `corePatternIndex` in the list payload example. The shared contracts currently expose both so later indexer/frontend work stays compatible until the public API shape is finalized.
- Interfaces/contracts modified: `packages/shared/src/automaton.ts` now exports `AutomatonRecord`, `AutomatonListResponse`, and `MonologuePage`; `packages/shared/src/spawn.ts` now exports payment instructions, session audit/status, and registry pagination types; `packages/shared/src/events.ts` now uses the locked indexer websocket event names `spawn|update|action|message|monologue|offline`.
- Validation commands that proved the milestone: `test -f packages/shared/src/spawn.ts`, `test -f packages/shared/src/automaton.ts`, `test -f packages/shared/src/events.ts`, `test -f packages/shared/src/catalog.ts`, `rg "SpawnSession|SpawnSessionState|quoteTermsHash" packages/shared/src/spawn.ts`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M02.md`, `packages/shared/src/automaton.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/catalog.ts`, `packages/shared/test/contracts.test.ts`, and the three locked spec files.

## 2026-03-10 M02 Implement shared contracts
- Revalidated the existing `packages/shared` contract layer against the locked M02 scope; no further product-code edits were required in this session.
- Important constraint still in force: keep extending the shared schema files in `packages/shared/src/` and preserve the temporary compatibility surface that exposes both `corePattern` and `corePatternIndex` until the public API field is finalized.
- Interfaces/contracts confirmed as the baseline for later milestones: `packages/shared/src/automaton.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/catalog.ts`, and the representative payload coverage in `packages/shared/test/contracts.test.ts`.
- Validation commands that proved the milestone: `test -f packages/shared/src/spawn.ts`, `test -f packages/shared/src/automaton.ts`, `test -f packages/shared/src/events.ts`, `test -f packages/shared/src/catalog.ts`, `rg "SpawnSession|SpawnSessionState|quoteTermsHash" packages/shared/src/spawn.ts`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M02.md`, `packages/shared/src/index.ts`, `packages/shared/src/automaton.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/catalog.ts`, `packages/shared/test/contracts.test.ts`, `specs/SPEC.md`, `specs/SPEC-INDEXER.md`, and `specs/SPEC-FACTORY.md`.

## 2026-03-10 M02 Implement shared contracts
- Re-ran the full locked M02 validation suite against the current workspace state and confirmed the existing `packages/shared` contract layer remains correct without product-code edits.
- Important constraints still in force: keep `packages/shared/src/` as the single contract surface for later milestones, and preserve the temporary compatibility fields `corePattern` plus `corePatternIndex` until the public API naming is finalized.
- Interfaces/contracts confirmed for downstream use: `packages/shared/src/automaton.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/catalog.ts`, and `packages/shared/test/contracts.test.ts`.
- Validation commands that proved the milestone: `test -f packages/shared/src/spawn.ts`, `test -f packages/shared/src/automaton.ts`, `test -f packages/shared/src/events.ts`, `test -f packages/shared/src/catalog.ts`, `rg "SpawnSession|SpawnSessionState|quoteTermsHash" packages/shared/src/spawn.ts`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M02.md`, `packages/shared/src/index.ts`, `packages/shared/src/automaton.ts`, `packages/shared/src/spawn.ts`, `packages/shared/src/events.ts`, `packages/shared/src/catalog.ts`, `packages/shared/test/contracts.test.ts`, `specs/SPEC.md`, `specs/SPEC-INDEXER.md`, and `specs/SPEC-FACTORY.md`.

## 2026-03-10 M03 Implement web shell and design system
- Replaced the placeholder web landing view with the locked launchpad shell: editorial header, joined nav group, `0 LIVE` pill, `CONNECT WALLET` CTA, responsive mobile menu, hero frame, and a dark viewport placeholder for the future grid surface.
- Important constraints discovered: the repo still has no Tailwind or shadcn/ui setup, so later frontend milestones should extend the plain React + CSS shell already in place instead of introducing a second styling system midstream unless the spec explicitly requires that migration.
- Interfaces/contracts introduced or modified: `apps/web/src/theme/tokens.ts` is now the frontend design-token contract for colors, typography, spacing, borders, and motion; `apps/web/src/App.tsx` plus `apps/web/src/styles.css` are now the structural shell baseline for later grid, drawer, and spawn-wizard work.
- Validation commands that proved the milestone: `test -f apps/web/src/App.tsx`, `test -f apps/web/src/theme/tokens.ts`, `rg "Instrument Serif|Azeret Mono|CONNECT WALLET|LIVE" apps/web/src`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M03.md`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/src/theme/tokens.ts`, `apps/web/src/App.test.tsx`, `mocks/mock-9.html`, `specs/SPEC.md`, and the shared contracts under `packages/shared/src/`.

## 2026-03-10 M04 Implement grid and detail drawer experience
- Replaced the placeholder viewport with a local mock-data-driven canvas grid plus responsive bottom drawer shell; hover shows tooltips, click opens the drawer, owned automatons keep labels visible, and the grid now renders parent-child links plus animated message routes.
- Important constraints discovered: frontend detail payloads must stay aligned with `packages/shared/src/automaton.ts` and keep runtime/financial extras nested under `runtime` and `financials`; importing shared TS source directly from `packages/shared/src/` keeps app linting/builds independent of a prebuilt `dist/`.
- Interfaces/contracts introduced or modified: `apps/web/src/components/grid/AutomatonCanvas.tsx`, `apps/web/src/components/drawer/AutomatonDrawer.tsx`, `apps/web/src/components/drawer/MonologuePanel.tsx`, `apps/web/src/components/drawer/CommandLinePanel.tsx`, and `apps/web/src/lib/mock-automatons.ts` are now the frontend surface for the grid/drawer milestone; `apps/web/src/theme/tokens.ts` and `apps/web/src/styles.css` were extended with drawer/grid colors and layout tokens.
- Validation commands that proved the milestone: `test -f apps/web/src/components/grid/AutomatonCanvas.tsx`, `test -f apps/web/src/components/drawer/AutomatonDrawer.tsx`, `test -f apps/web/src/components/drawer/MonologuePanel.tsx`, `test -f apps/web/src/components/drawer/CommandLinePanel.tsx`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M04.md`, `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/src/lib/mock-automatons.ts`, `apps/web/src/components/grid/AutomatonCanvas.tsx`, `apps/web/src/components/drawer/AutomatonDrawer.tsx`, `apps/web/src/components/drawer/MonologuePanel.tsx`, `apps/web/src/components/drawer/CommandLinePanel.tsx`, and `packages/shared/src/automaton.ts`.

## 2026-03-10 M05 Implement spawn wizard and provider configuration UX
- Added the frontend-only spawn flow under `apps/web/src/components/spawn/`: six steps, step progress, ESC/click-outside close, provider config, funding summary, and nav-driven modal launch from `apps/web/src/App.tsx`.
- Important constraints discovered: keep the wizard sessionless until M09 and treat the quote math in `apps/web/src/components/spawn/spawn-state.ts` as temporary UX scaffolding only; later work should replace the fixed local `platform fee`, `creation cost`, and ETH/USD conversion with real session quote data rather than changing the UI contract.
- Interfaces/contracts introduced or modified: `apps/web/src/components/spawn/SpawnWizard.tsx`, `apps/web/src/components/spawn/steps/*.tsx`, `apps/web/src/components/spawn/spawn-state.ts`, `apps/web/src/api/openrouter.ts`, and `apps/web/src/lib/default-models.ts` are now the spawn-wizard surface; `apps/web/src/styles.css` extends the existing shell with the modal and step styling.
- Validation commands that proved the milestone: `test -f apps/web/src/components/spawn/SpawnWizard.tsx`, `test -f apps/web/src/components/spawn/steps/ProviderConfigStep.tsx`, `test -f apps/web/src/lib/default-models.ts`, `rg "OpenRouter|Brave|gross|platform fee|creation cost" apps/web/src/components/spawn apps/web/src/lib/default-models.ts`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M05.md`, `apps/web/src/components/spawn/SpawnWizard.tsx`, `apps/web/src/components/spawn/spawn-state.ts`, `apps/web/src/components/spawn/steps/ProviderConfigStep.tsx`, `apps/web/src/components/spawn/steps/FundStep.tsx`, `apps/web/src/api/openrouter.ts`, `apps/web/src/lib/default-models.ts`, and `packages/shared/src/spawn.ts`.

## 2026-03-10 M06 Implement indexer foundation
- Added the indexer foundation under `apps/indexer/src/`: config resolution, Fastify server wiring, `/health`, baseline `/api/automatons` plus detail/monologue routes, SQLite schema/bootstrap, and a `/ws/events` realtime skeleton with canister-filter-aware broadcast plumbing.
- Important constraints discovered: the workspace does not have the spec’s `@fastify/websocket` or `better-sqlite3` packages installed, so M06 uses a manual websocket upgrade handler and the system `sqlite3` CLI while keeping the public route paths and event contracts stable for later replacement.
- Interfaces/contracts introduced or modified: `apps/indexer/src/store/sqlite.ts` is now the backend persistence contract, storing automaton summary/detail payloads plus monologue and price data; `apps/indexer/src/ws/events.ts` exposes the reusable realtime hub/filter surface; `apps/indexer/src/routes/health.ts` and `apps/indexer/src/routes/automatons.ts` are now the baseline REST entrypoints.
- Validation commands that proved the milestone: `test -f apps/indexer/src/server.ts`, `test -f apps/indexer/src/routes/health.ts`, `test -f apps/indexer/src/store/sqlite.ts`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M06.md`, `apps/indexer/src/server.ts`, `apps/indexer/src/store/sqlite.ts`, `apps/indexer/src/store/schema.sql`, `apps/indexer/src/ws/events.ts`, `apps/indexer/src/routes/automatons.ts`, `apps/indexer/test/server.test.ts`, `apps/indexer/test/sqlite.test.ts`, `specs/SPEC-INDEXER.md`, and `packages/shared/src/events.ts`.

## 2026-03-10 M07 Implement factory session core
- Replaced the factory stub with a Rust domain surface under `backend/factory/src/` that now owns session types, fixed quote generation, upgrade-safe snapshot state, audit trails, public session/registry reads, and admin config/pause APIs.
- Important constraints discovered: the workspace still has no IC runtime/stable-memory crates wired in, so the upgrade-safe seam is currently `FactoryStateSnapshot` plus `snapshot_state`/`restore_state`; preserve that interface when later milestones add real canister hooks. Session creation also rejects gross quotes below the configured fee-plus-creation minimum, so later underfunding logic must compare escrow payment against the locked session quote rather than accept invalid quote creation.
- Interfaces/contracts introduced or modified: `backend/factory/src/types.rs` is the canonical Rust contract for session, quote, audit, registry, and admin view shapes; `backend/factory/src/state.rs` owns persistent config/session/registry storage plus audit-log plumbing; `backend/factory/src/api/public.rs` and `backend/factory/src/api/admin.rs` now expose `create_spawn_session`, `get_spawn_session`, registry reads, quote-config updates, and `set_pause`.
- Validation commands that proved the milestone: `test -f backend/factory/src/lib.rs`, `test -f backend/factory/src/state.rs`, `test -f backend/factory/src/types.rs`, `rg "create_spawn_session|get_spawn_session|quoteTermsHash|expiresAt|pause" backend/factory/src`, `npm run lint`, `npm run build`, `npm run test`, `npm run lint:factory`, and `npm run test:factory`.
- References the next milestone must read first: `ralph/reports/M07.md`, `backend/factory/src/lib.rs`, `backend/factory/src/types.rs`, `backend/factory/src/state.rs`, `backend/factory/src/api/public.rs`, `backend/factory/src/api/admin.rs`, `packages/shared/src/spawn.ts`, and `specs/SPEC-FACTORY.md`.

## Session-specific instructions

- Write the milestone report to `ralph/reports/M08.md`.
- Append a new section to `ralph/notes/rolling-handoff.md` for `M08`.
- Do not mark milestone completion anywhere except via the required report/handoff updates. The external runner decides completion after validation.
- If you are blocked, say `BLOCKED` and explain why in both the report and final response.
- If you complete the milestone, say `COMPLETED` and summarize validations run.
