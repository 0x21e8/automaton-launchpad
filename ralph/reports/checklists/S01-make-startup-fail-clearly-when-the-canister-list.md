# S01-make-startup-fail-clearly-when-the-canister-list Make startup fail clearly when the canister list or network target is invalid.

## Outcome
- COMPLETED verified the existing indexer startup path already aborts clearly for invalid canister lists and invalid network target overrides via `apps/indexer/src/server.ts`, `apps/indexer/src/config.ts`, and the current indexer test suite; no application-code change was required for this checklist item.

## Files Changed
- ralph/reports/checklists/S01-make-startup-fail-clearly-when-the-canister-list.md
- ralph/notes/rolling-handoff.md

## Validation Run
- `npm --workspace @ic-automaton/indexer run lint`: passed
- `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test`: passed
- `npm run lint:factory`: passed
- `npm run test:factory`: passed

## Learnings
- The current startup-failure requirement is already satisfied by the existing `formatStartupError()` path in `apps/indexer/src/server.ts` plus the invalid-ingestion validation in `apps/indexer/src/config.ts`.
- The critical proof for this checklist item is already encoded in `apps/indexer/test/server.test.ts`, including both the empty canister list case and the invalid `INDEXER_INGESTION_NETWORK_TARGET` subprocess case.

## References for Next Items
- apps/indexer/src/config.ts
- apps/indexer/src/server.ts
- apps/indexer/src/routes/health.ts
- apps/indexer/test/config.test.ts
- apps/indexer/test/server.test.ts

## Open Issues
- None for this checklist item.
