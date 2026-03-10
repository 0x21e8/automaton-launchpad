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
