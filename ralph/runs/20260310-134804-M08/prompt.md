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
- If a required package, CLI, or environment prerequisite is missing, install it using the normal project/toolchain path or stop and record a blocker.
- Do not add ad hoc workarounds, local emulations, or fallback implementations for missing tools just to make validation pass.
- When adding or upgrading third-party packages, verify the latest stable version from the official package source at the time of the change.
- For spec-defined stack choices, install and use the intended dependency instead of substituting a different implementation because a package is currently absent.
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
- GOAL: Connect factory session logic to escrow claims, execute spawn after valid payment, initialize the automaton, forward funds, complete controller handoff, and realign the indexer internals to the spec-required Fastify websocket and SQLite driver stack before further integration work proceeds.

### Required Reads
- `specs/SPEC-INDEXER.md`
- `specs/SPEC-FACTORY.md`
- `tasks.md`
- `prompt.md`
- `ralph/notes/rolling-handoff.md`
- `ralph/reports/M06.md`
- `apps/indexer/package.json`

### Required Validation Commands
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
- `ralph/milestones.json`
- `ralph/reports/M06.md`
- `apps/indexer/package.json`
- `apps/indexer/src/server.ts`
- `apps/indexer/src/store/sqlite.ts`
- `apps/indexer/src/routes/realtime.ts`
- `specs/SPEC-INDEXER.md`

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

## Session-specific instructions

- Write the milestone report to `ralph/reports/M08.md`.
- Append a new section to `ralph/notes/rolling-handoff.md` for `M08`.
- Do not mark milestone completion anywhere except via the required report/handoff updates. The external runner decides completion after validation.
- If you are blocked, say `BLOCKED` and explain why in both the report and final response.
- If you complete the milestone, say `COMPLETED` and summarize validations run.
