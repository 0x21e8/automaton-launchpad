# S01-validate-config-at-startup-with-clear-error-mess Validate config at startup with clear error messages for:

## Outcome
- COMPLETED: added indexer startup validation for empty canister lists, invalid canister ID format, unsupported `network.target`, and missing local host/port before the Fastify server boots.
- COMPLETED: extended indexer config tests to cover the required failures and verified that invalid ingestion config stops server startup immediately.

## Files Changed
- `apps/indexer/src/config.ts`
- `apps/indexer/src/server.ts`
- `apps/indexer/test/config.test.ts`
- `ralph/reports/checklists/S01-validate-config-at-startup-with-clear-error-mess.md`
- `ralph/notes/rolling-handoff.md`

## Validation Run
- `npm --workspace @ic-automaton/indexer run lint`: passed
- `npm --workspace @ic-automaton/indexer run test -- config.test.ts server.test.ts`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test`: passed
- `npm run lint:factory`: passed
- `npm run test:factory`: passed

## Learnings
- The existing `apps/indexer/src/config.ts` resolver was already the correct startup seam, so validation belongs there instead of in a separate bootstrap layer.
- The workspace does not already include a DFINITY principal parser, so canister ID validation was implemented locally with canonical base32 plus CRC32 checksum checks instead of adding a new dependency for this checklist item.
- Catching `buildServer()` inside `start()` is required for config validation failures to surface as clean startup errors rather than escaping before `listen()`.

## References for Next Items
- `apps/indexer/src/indexer.config.ts`
- `apps/indexer/src/config.ts`
- `apps/indexer/src/server.ts`
- `apps/indexer/src/routes/health.ts`
- `apps/indexer/test/config.test.ts`
- `ralph/reports/checklists/S01-validate-config-at-startup-with-clear-error-mess.md`

## Open Issues
- None for this checklist item.
