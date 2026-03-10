# Single Automaton E2E Checklist

Goal: make one real automaton available end to end in the launchpad UI using `http://txyno-ch777-77776-aaaaq-cai.localhost:8000/`, without relying on the factory flow.

Indexer input requirement:
- The indexer accepts a list of canister IDs.
- The indexer can target either mainnet or a local replica.
- For local replica mode, the host and port are configurable.
- The target configuration should live in one typed config file, with environment overrides only where operationally necessary.

## 1. Rebuild indexer ingestion around explicit canister inputs

- [x] Add a dedicated indexer config file as the single source of truth for:
  - canister ID list
  - network target: `mainnet` or `local`
  - local host
  - local port
- [x] Keep the config shape small and typed; do not split core runtime targeting across multiple unrelated env vars.
- [x] Validate config at startup with clear error messages for:
  - empty canister list
  - invalid canister ID format
  - unsupported network target
  - missing local host or port when `local` is selected
- [x] Support environment overrides only for deployment/runtime concerns, while preserving the config file as the default source.
- [x] Make startup fail clearly when the canister list or network target is invalid.
- [x] Surface the configured canister list and target network in `/health`.
- [x] Load the configured canister ID list on startup.
- [x] Implement a real polling loop for identity/config reads for the target automaton.
- [x] Implement a real polling loop for runtime/financial reads for the target automaton.
- [x] Implement a real polling loop for recent monologue/turn data for the target automaton.
- [x] Normalize live canister responses into the shared `AutomatonDetail` and `AutomatonSummary` contracts.
- [x] Persist the normalized automaton snapshot into SQLite.
- [x] Persist recent monologue entries into SQLite with idempotent upserts.
- [x] Compute deterministic grid placement for the real automaton instead of relying on mock positions.
- [x] Compute explorer/canister links from live chain/canister data.
- [x] Compute net worth from live balances plus a real or explicitly fixed ETH/USD source.
- [x] Expose health/debug output that proves the target automaton was polled successfully.

### Task Group 1 implementation notes

Use this when revisiting the live single-automaton path so the next pass does not have to rediscover the same seams.

- Start with these files:
  - `apps/indexer/src/indexer.config.ts`
  - `apps/indexer/src/server.ts`
  - `apps/indexer/src/integrations/automaton-client.ts`
  - `apps/indexer/src/polling/automaton-indexer.ts`
  - `apps/indexer/src/normalize/automaton.ts`
  - `apps/indexer/src/lib/automaton-derived.ts`
  - `apps/indexer/src/store/sqlite.ts`
- The default local target is the real backend canister `txyno-ch777-77776-aaaaq-cai` on `localhost:8000`.
- The sibling repo with the real automaton contract is `/Users/domwoe/Dev/projects/ic-automaton`.
- The most useful discovery paths in that sibling repo were:
  - `ic-automaton.did`
  - `docs/debugging-live-canister.md`
  - `.icp/cache/mappings/local.ids.json`
  - `.icp/cache/networks/local/descriptor.json`
- We no longer use the old agent packages directly. The working SDK line here is `@icp-sdk/core@4.2.3`, with imports from:
  - `@icp-sdk/core/agent`
  - `@icp-sdk/core/candid`
- Group 1 needed both HTTP and Candid reads. The live client currently pulls:
  - HTTP: `/api/build-info`, `/api/evm/config`, `/api/steward/status`, `/api/scheduler/config`, `/api/snapshot`, `/api/wallet/balance`
  - Candid: `get_prompt_layers`, `list_skills`, `list_strategy_templates`
- Local URL construction is easy to get wrong. `apps/indexer/src/lib/automaton-derived.ts` handles:
  - `http://<canister>.<host>:<port>` for hostname-based local access
  - `?canisterId=...` fallback when the configured local host is an IP literal
  - `https://<canister>.icp0.io` for mainnet canister URLs
- Polling is intentionally split into three loops:
  - identity/config
  - runtime/financial
  - monologue/recent turns
- Health evidence for the live poller is exposed at `/health` under `polling.live`.
- Detail reads now hydrate monologue from SQLite in `apps/indexer/src/store/sqlite.ts`; do not assume the embedded snapshot monologue is the full source of truth anymore.
- The ETH/USD source is intentionally explicit, not implied. Group 1 shipped with a fixed source in `apps/indexer/src/polling/automaton-indexer.ts`.
- Remaining caveat: the code was wired against the real canister contract, but the sandbox session did not prove a full end-to-end poll against a live local replica. If this needs to be rechecked manually, compare the canister HTTP responses on `localhost:8000` with `/health` and the SQLite-backed `/api/automatons` output.

## 2. Make realtime minimally real

- [x] Emit `update` events when the indexed automaton snapshot changes.
- [x] Emit `monologue` events when new monologue entries are observed.
- [x] Ensure websocket subscriptions filtered by `canisterId` work with the live automaton.
- [x] Add an integration test that opens a real websocket against the indexer and observes at least one event path.

### Task Group 2 implementation notes

- The realtime emission seam now lives in `apps/indexer/src/polling/automaton-indexer.ts` via `eventPublisher`.
- `apps/indexer/src/server.ts` binds the poller to the existing `RealtimeHub`, so the poller emits through the same websocket path the routes already expose.
- `apps/indexer/src/lib/automaton-record.ts` converts `AutomatonDetail` into `AutomatonRecord` and computes top-level diffs for `update` events.
- Do not treat `lastPolledAt` as a meaningful snapshot change for realtime. Including it causes an `update` event on every poll even when the automaton state is identical.
- Runtime-free identity polls must preserve the existing survival tier. Resetting to `normal` on identity reads creates a false `normal -> low` oscillation and spurious `update` events.
- New monologue events are derived by comparing normalized recent turns against the existing SQLite monologue window before upsert, then emitting only unseen entries in chronological order.
- The real websocket integration coverage is in `apps/indexer/test/realtime.test.ts`.
- That test opens an actual listening Fastify server and a real websocket client, so sandboxed environments may need localhost bind permission to run it.

## 3. Remove frontend dependence on simulated state

- [ ] Remove the hardcoded simulated viewer address from the primary app path.
- [ ] Replace any remaining dependence on `mock-automatons` in production rendering paths.
- [ ] Make the app handle the single-automaton case cleanly:
  - one item in the grid
  - one selectable drawer target
  - empty-state messaging only when the indexer is truly empty or failing
- [ ] Keep scope filtering honest; if wallet filtering is not implemented, hide or disable “My Automatons”.
- [ ] Gate command execution copy correctly so the UI does not imply a real wallet or signer exists when it does not.

## 4. Restore mock-9 visual fidelity

- [ ] Audit the current web shell against `mocks/mock-9.html` and treat the mock as the acceptance baseline.
- [ ] Align header structure with the mock:
  - wordmark/tagline hierarchy
  - nav button grouping
  - live pill placement
  - wallet button styling and states
- [ ] Align the canvas stage with the mock:
  - full-bleed canvas emphasis
  - reduced surrounding marketing copy
  - tooltip look and behavior
- [ ] Align the drawer with the mock:
  - bottom-sheet behavior
  - three-column metadata layout
  - monologue and CLI split
  - button and badge styling
- [ ] Align the wizard with the mock:
  - overlay treatment
  - header/footer structure
  - card/checklist styling
  - funding input presentation
- [ ] Remove visual additions that are not part of the mock language unless they are required for live-data usability.
- [ ] Review typography, spacing, border weights, and color tokens against the mock and collapse any drift back into the token system.

## 5. Remove preview-shell behavior that misrepresents the product

- [x] Replace “Connected wallet” presentation with truthful connection status.
- [x] Replace “live session + payment tracking” claims with copy that reflects the non-factory scope.
- [x] Remove or relabel command-line actions that are preview-only.
- [x] Remove or relabel monologue copy that implies a websocket stream if the data is still polling-based.
- [x] Ensure all empty/error copy distinguishes:
  - indexer unavailable
  - no automaton indexed
  - detail load failed
