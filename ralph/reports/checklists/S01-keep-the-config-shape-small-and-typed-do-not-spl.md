# S01-keep-the-config-shape-small-and-typed-do-not-spl Keep the config shape small and typed; do not split core runtime targeting across multiple unrelated env vars.

## Outcome
- COMPLETED
- Confirmed the indexer runtime already satisfies this item through `apps/indexer/src/indexer.config.ts` and `apps/indexer/src/config.ts`: canister IDs and network targeting live under one typed `ingestion` object, and `icHost` is derived from that object instead of being configured separately.
- Removed stale README guidance that still advertised the old split `INDEXER_SEED_CANISTER_IDS` and `INDEXER_IC_HOST` targeting knobs.

## Files Changed
- README.md
- ralph/reports/checklists/S01-keep-the-config-shape-small-and-typed-do-not-spl.md
- ralph/notes/rolling-handoff.md

## Validation Run
- `npm run lint`: passed
- `npm run build`: passed
- `npm run test`: passed
- `npm run lint:factory`: passed
- `npm run test:factory`: passed

## Learnings
- The current runtime boundary is already the right seam for this checklist item: `resolveIndexerConfig` keeps deployment/runtime overrides separate from ingestion targeting while preserving a small typed target shape.
- The only remaining contradiction for this item was documentation drift in `README.md`, not runtime code.

## References for Next Items
- apps/indexer/src/indexer.config.ts
- apps/indexer/src/config.ts
- apps/indexer/test/config.test.ts
- README.md

## Open Issues
- Startup validation for invalid canister IDs, unsupported targets, and missing local replica fields is still deferred to the next checklist items.
