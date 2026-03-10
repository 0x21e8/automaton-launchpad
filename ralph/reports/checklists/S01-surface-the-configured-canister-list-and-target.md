# S01-surface-the-configured-canister-list-and-target Surface the configured canister list and target network in `/health`.

## Outcome
- COMPLETED
- Extended `apps/indexer/src/routes/health.ts` so `/health` now reports the configured canister list plus the effective ingestion target under `discovery.targetNetwork`.
- Surfaced the derived `icHost` for both targets and the configured local replica host/port when `network.target = local`.
- Added indexer server tests covering both the default local target and a runtime-overridden mainnet target in the `/health` response.

## Files Changed
- `apps/indexer/src/routes/health.ts`
- `apps/indexer/test/server.test.ts`
- `ralph/reports/checklists/S01-surface-the-configured-canister-list-and-target.md`
- `ralph/notes/rolling-handoff.md`

## Validation Run
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test`: passed
- `npm run lint:factory`: passed
- `npm run test:factory`: passed

## Learnings
- The existing `/health` route already exposed `discovery.seedCanisterIds`, so this item only needed the missing target-network contract instead of a broader health-route redesign.
- Exposing `discovery.targetNetwork.icHost` alongside `target` makes the effective replica/mainnet destination visible without duplicating config resolution logic outside `apps/indexer/src/config.ts`.
- Returning `localReplica: null` for mainnet keeps the `/health` payload explicit about when local host/port settings are inactive.

## References for Next Items
- `apps/indexer/src/routes/health.ts`
- `apps/indexer/test/server.test.ts`
- `apps/indexer/src/config.ts`
- `apps/indexer/src/indexer.config.ts`
- `npm --workspace @ic-automaton/indexer run test -- server.test.ts`

## Open Issues
- None within this checklist item scope.
