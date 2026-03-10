# S01-load-the-configured-canister-id-list-on-startup Load the configured canister ID list on startup.

## Outcome
- COMPLETED
- added a durable `configured_canisters` SQLite registry so the indexer now materializes configured ingestion targets at startup instead of only validating/exposing them
- wired `apps/indexer/src/server.ts` to sync `indexerConfig.ingestion.canisterIds` during `onReady`, keeping the public automaton list unchanged until real polling populates snapshots
- added store/server tests that prove startup seeding happens and remains separate from indexed automaton records

## Files Changed
- apps/indexer/src/store/schema.sql
- apps/indexer/src/store/sqlite.ts
- apps/indexer/src/server.ts
- apps/indexer/test/sqlite.test.ts
- apps/indexer/test/server.test.ts

## Validation Run
- command: `npm --workspace @ic-automaton/indexer run lint` -> passed
- command: `npm --workspace @ic-automaton/indexer run test -- sqlite.test.ts server.test.ts` -> passed
- command: `npm run lint` -> passed
- command: `npm run build` -> passed
- command: `npm run test` -> passed
- command: `npm run lint:factory` -> passed
- command: `npm run test:factory` -> passed

## Learnings
- loading configured canister IDs on startup needed a distinct registry seam; the existing `automatons` table stores normalized snapshots and could not safely represent unpolled targets
- syncing config-seeded IDs separately from public automaton records keeps future polling work straightforward and avoids implying that configured targets are already indexed

## References for Next Items
- `apps/indexer/src/store/schema.sql`
- `apps/indexer/src/store/sqlite.ts`
- `apps/indexer/src/server.ts`
- `apps/indexer/test/sqlite.test.ts`
- `apps/indexer/test/server.test.ts`

## Open Issues
- the startup registry currently stores configured targets only; the next polling-loop items still need to consume `listConfiguredCanisterIds()` and write real normalized automaton snapshots into `automatons`
