# S01-add-a-dedicated-indexer-config-file-as-the-singl Add a dedicated indexer config file as the single source of truth for:

## Outcome
- COMPLETED
- Added `apps/indexer/src/indexer.config.ts` as the dedicated typed source of truth for the indexer canister list, target network, and local replica host/port.
- Refactored `apps/indexer/src/config.ts` to consume that file by default and derive `icHost` from the selected target instead of sourcing canister/network inputs from separate env vars.
- Added indexer tests proving the dedicated config file is the default ingestion source and that `icHost` is derived from the configured network target.

## Files Changed
- `apps/indexer/src/indexer.config.ts`
- `apps/indexer/src/config.ts`
- `apps/indexer/src/routes/health.ts`
- `apps/indexer/test/config.test.ts`
- `ralph/reports/checklists/S01-add-a-dedicated-indexer-config-file-as-the-singl.md`
- `ralph/notes/rolling-handoff.md`

## Validation Run
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test`: passed
- `npm run lint:factory`: passed
- `npm run test:factory`: passed

## Learnings
- The existing `apps/indexer/src/config.ts` already owned runtime resolution, so the cleanest seam was to add a dedicated target-config module and keep the rest of the server startup path stable.
- The checklist goal implies a concrete default local target, so the new config file is anchored to `txyno-ch777-77776-aaaaq-cai` on `localhost:8000`.
- `icHost` can be derived deterministically from the new target config, which removes one source of split configuration before startup validation is added in later items.

## References for Next Items
- `apps/indexer/src/indexer.config.ts`
- `apps/indexer/src/config.ts`
- `apps/indexer/src/routes/health.ts`
- `apps/indexer/test/config.test.ts`
- `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`

## Open Issues
- Startup validation for invalid canister IDs, empty canister lists, unsupported targets, and missing local replica fields is not part of this item and still needs to be added in the next checklist steps.
- `/health` still does not expose the target network; this was left untouched to avoid pulling that later checklist item forward.
