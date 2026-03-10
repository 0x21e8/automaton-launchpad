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
  - `cargo fmt --check`
  - `cargo test --workspace`
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

- MILESTONE_ID: `M01`
- TITLE: Bootstrap workspace and validation harness
- GOAL: Create the monorepo skeleton, deterministic root validation scripts, and baseline test/build plumbing so later milestones have stable entrypoints.

### Required Reads
- `specs/SPEC.md`
- `specs/SPEC-INDEXER.md`
- `specs/SPEC-FACTORY.md`
- `tasks.md`
- `mocks/mock-9.html`
- `prompt.md`
- `ralph/notes/rolling-handoff.md`

### Required Validation Commands
- `test -f package.json`
- `test -f Cargo.toml`
- `test -f apps/web/package.json`
- `test -f apps/indexer/package.json`
- `test -f backend/factory/Cargo.toml`
- `npm install`
- `npm run lint`
- `npm run build`
- `npm run test`
- `cargo fmt --check`
- `cargo test --workspace`

### Already Completed Milestones
- none

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

## Session-specific instructions

- Write the milestone report to `ralph/reports/M01.md`.
- Append a new section to `ralph/notes/rolling-handoff.md` for `M01`.
- Do not mark milestone completion anywhere except via the required report/handoff updates. The external runner decides completion after validation.
- If you are blocked, say `BLOCKED` and explain why in both the report and final response.
- If you complete the milestone, say `COMPLETED` and summarize validations run.
