# S01-support-environment-overrides-only-for-deploymen Support environment overrides only for deployment/runtime concerns, while preserving the config file as the default source.

## Outcome
- COMPLETED: added bounded indexer ingestion env overrides for `network.target`, `network.local.host`, and `network.local.port` while keeping `canisterIds` sourced from `apps/indexer/src/indexer.config.ts`.
- COMPLETED: documented the allowed runtime override surface and added tests that lock default-source behavior plus invalid override failures.

## Files Changed
- apps/indexer/src/config.ts
- apps/indexer/test/config.test.ts
- README.md
- ralph/reports/checklists/S01-support-environment-overrides-only-for-deploymen.md
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
- Runtime overrides are now intentionally limited to deployment-facing ingestion settings; the seeded canister list remains config-file only.
- Invalid ingestion env overrides still fail through the existing startup validation path, so no separate fallback or silent coercion was introduced.

## References for Next Items
- apps/indexer/src/indexer.config.ts
- apps/indexer/src/config.ts
- apps/indexer/src/routes/health.ts
- apps/indexer/test/config.test.ts
- README.md

## Open Issues
- None.
