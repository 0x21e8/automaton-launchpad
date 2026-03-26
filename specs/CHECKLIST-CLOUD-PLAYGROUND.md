# Cloud Playground - Execution-Ready Checklist

**Status:** Proposed, execution-ready checklist
**Date:** 2026-03-26
**Source:** `specs/DESIGN-CLOUD-PLAYGROUND.md`
**Audience:** coding agents working in this repo
**Scope:** implement the shared public playground on one VPS without changing the core spawn product model

## Outcome

Ship one public playground where a user can:

- open the web app over HTTPS
- choose an injected wallet provider
- add and switch to a dedicated playground EVM network
- claim test ETH and USDC
- create and pay a spawn session on the forked Base playground chain
- observe the resulting spawn lifecycle through the existing web and indexer flow

At the same time:

- raw Anvil stays private
- the local ICP network stays private
- reset windows and non-durable behavior are obvious in the UI
- deploys are reproducible and do not rely on `git pull` + ad hoc builds on the VPS

## Locked Decisions

These decisions close the main gaps in the design doc. Treat them as the implementation contract unless the design doc is revised.

1. Public wallet RPC is a new standalone app at `apps/rpc-gateway`.
   Reason: the JSON-RPC boundary is distinct from the existing REST/WebSocket indexer boundary, and it needs its own allowlist and rate limiting.

2. Faucet and playground metadata live inside `apps/indexer` for v1.
   Reason: this repo already has a Fastify service, SQLite store, health route, and public API surface. A separate faucet app is extra process overhead without clear value for the first shared playground.

3. The web app must fetch runtime playground metadata from the indexer at `GET /api/playground`.
   Reason: reset windows, maintenance mode, and public RPC metadata are runtime state, not build-time constants.

4. Use one dedicated playground chain ID: `20260326` (`0x13525e6`).
   Reason: the current local default `8453` impersonates Base mainnet and must not be reused on a public playground.

5. Keep current local developer defaults working.
   Reason: `scripts/dev.sh`, current wallet tests, and laptop workflows should continue to work without requiring the full playground stack. Playground behavior should activate only when the new env/config is present.

6. Reuse the existing `scripts/seed-local-wallet.mjs` funding logic rather than reimplementing mint/fund behavior in a second codepath.
   Reason: the faucet can shell out through a thin service seam in v1 and later be refactored if needed.

7. Bootstrap/reset scripts are the operational source of truth.
   Reason: deploy workflows should call repo-owned scripts, not embed orchestration logic directly in GitHub Actions YAML.

8. Hard reset deploys are the default until the environment stabilizes.
   Reason: soft deploys are only safe once the artifact contract, chain config, and reset metadata flow are proven.

9. Optional tooling stays optional.
   `otterscan`, monitoring, and richer abuse controls are behind Compose profiles or follow-up tasks, not required for the first working playground.

## Scope Guardrails

- Do not expose raw Anvil on `0.0.0.0`.
- Do not expose the ICP local replica publicly.
- Do not redesign the existing spawn session product flow.
- Do not add a second persistence system just for playground metadata; extend the existing indexer + SQLite surface.
- Do not block v1 on CAPTCHA, preview environments, or a separate faucet service.
- Do not make the web app depend exclusively on build-time `VITE_SPAWN_*` values once playground metadata exists.

## External Prerequisites

The repo can prepare for these, but a coding agent cannot fully satisfy them from code alone:

- a VPS with Docker Compose, Caddy, `systemd`, Node 22, Foundry, and `icp`
- DNS + TLS for `playground.<domain>` and `rpc.playground.<domain>`
- a Base upstream RPC secret
- a child Wasm artifact path plus commit SHA from the `ic-automaton` release pipeline

## Dependency Order

Use this order rather than following the original design doc section-by-section.

1. `CP-01` and `CP-02` can start in parallel.
2. `CP-03` depends on `CP-01`.
3. `CP-04` depends on `CP-01` and should reuse the seam from `CP-03`.
4. `CP-05` depends on `CP-01` and `CP-03`.
5. `CP-06` depends on `CP-05`.
6. `CP-07` depends on `CP-02`, `CP-03`, and `CP-04`.
7. `CP-08` depends on `CP-02`, `CP-03`, `CP-04`, and existing deploy scripts.
8. `CP-09` depends on `CP-07` and `CP-08`.
9. `CP-10` depends on `CP-08` and `CP-09`.

## Checklist

### Phase 1 - Shared contracts and config

- [x] **CP-01: Add a first-class playground metadata contract**
  - Files to create:
    - `packages/shared/src/playground.ts`
  - Files to modify:
    - `packages/shared/src/index.ts`
    - `apps/indexer/src/config.ts`
    - `apps/indexer/test/config.test.ts`
  - Implement:
    - a shared `PlaygroundMetadata` type that covers:
      - environment label, environment version, maintenance flag
      - chain ID, chain name, public RPC URL, native currency, optional explorer URL
      - faucet availability, claim limits, and claim asset amounts
      - last reset time, next reset time, and reset cadence label
    - indexer config parsing for new `PLAYGROUND_*` env vars plus a `PLAYGROUND_STATUS_FILE` path
    - a local-dev fallback path so the current repo still works without playground env vars
  - Important detail:
    - keep the public chain metadata separate from the existing `VITE_SPAWN_*` fallbacks; the web app will consume runtime metadata later, but local dev should still build before that work lands
  - Done when:
    - the shared type is exported and consumed by the indexer config layer
    - config tests cover both "no playground env" and "playground env present"
  - Validation:
    - `npm run test --workspace @ic-automaton/indexer`
    - `npm run test --workspace @ic-automaton/shared`

- [x] **CP-02: Create `apps/rpc-gateway` as the only public JSON-RPC surface**
  - Files to create:
    - `apps/rpc-gateway/package.json`
    - `apps/rpc-gateway/tsconfig.json`
    - `apps/rpc-gateway/tsconfig.build.json`
    - `apps/rpc-gateway/src/config.ts`
    - `apps/rpc-gateway/src/server.ts`
    - `apps/rpc-gateway/src/policy.ts`
    - `apps/rpc-gateway/test/server.test.ts`
  - Files to modify:
    - `package.json`
  - Implement:
    - a small Fastify app that accepts JSON-RPC POST requests and forwards only wallet-safe methods to private Anvil
    - explicit allowlist for the methods named in the design doc
    - hard rejects for namespaces such as `anvil_*`, `debug_*`, `admin_*`, `personal_*`, `txpool_*`, and `evm_*`
    - request body size limit and IP-based rate limiting
    - a health route returning the configured chain ID and upstream RPC target
  - Important detail:
    - deny by method name before forwarding upstream
    - keep the upstream URL private and configurable with env such as `RPC_GATEWAY_UPSTREAM_URL=http://127.0.0.1:8545`
  - Done when:
    - `eth_chainId` and `eth_sendRawTransaction` can be forwarded
    - `anvil_setCode` and other denied methods fail at the gateway without reaching Anvil
    - the root workspace can lint/build/test the new app
  - Validation:
    - `npm run test --workspace @ic-automaton/rpc-gateway`
    - `npm run build --workspace @ic-automaton/rpc-gateway`

## Relevant Learnings From Phase 1

- `@ic-automaton/shared` is consumed through both `src/` and `dist/` artifacts in this repo. Adding a new shared module requires keeping the checked-in `src/*.js` and `src/*.d.ts` export surface in sync with the TypeScript source, or downstream workspace builds can miss new symbols even when `dist/` is correct.
- Adding a new workspace app also requires refreshing [`package-lock.json`](/Users/domwoe/Dev/projects/automaton-launchpad/package-lock.json). `npm install --package-lock-only --ignore-scripts` was enough here and should be reused for later repo-owned services such as a separate faucet app if one is added.

### Phase 2 - Indexer-owned playground API

- [x] **CP-03: Add `GET /api/playground` to the indexer**
  - Files to create:
    - `apps/indexer/src/routes/playground.ts`
  - Files to modify:
    - `apps/indexer/src/server.ts`
    - `apps/indexer/src/types.ts`
    - `apps/indexer/test/server.test.ts`
  - Implement:
    - a route returning `PlaygroundMetadata`
    - a small status-file reader for `PLAYGROUND_STATUS_FILE`
    - stable behavior when the status file is missing: return config-derived metadata with nullable reset timestamps instead of failing the server
  - Important detail:
    - the status file should be treated as operator-written runtime state, not as user input
    - the route must never expose secrets, private RPC URLs, or admin/reset actions
  - Status file contract:
    - JSON with fields such as `environmentVersion`, `maintenance`, `message`, `lastResetAt`, `nextResetAt`, and `updatedAt`
    - default local path can be `tmp/playground-status.json`
  - Done when:
    - the web app can discover all public playground values through one route
    - server tests cover both present and missing status-file cases
  - Validation:
    - `npm run test --workspace @ic-automaton/indexer`

- [x] **CP-04: Add a rate-limited faucet endpoint to the indexer**
  - Files to create:
    - `apps/indexer/src/lib/faucet.ts`
    - `apps/indexer/src/routes/faucet.ts`
  - Files to modify:
    - `apps/indexer/src/store/schema.sql`
    - `apps/indexer/src/store/sqlite.ts`
    - `apps/indexer/src/server.ts`
    - `apps/indexer/test/server.test.ts`
    - `apps/indexer/test/sqlite.test.ts`
    - `scripts/seed-local-wallet.mjs`
  - Implement:
    - `POST /api/playground/faucet`
    - address validation and normalization
    - per-IP and per-wallet claim limits backed by SQLite
    - a service seam that executes the existing wallet-seeding script and returns parsed JSON
    - response fields containing tx hashes, funded amounts, and resulting balances
  - Important detail:
    - do not duplicate the mint/fund logic; let the route call a dedicated helper that wraps `scripts/seed-local-wallet.mjs`
    - make the helper injectable so route tests can stub the seeding execution instead of spawning child processes
  - Suggested schema additions:
    - `faucet_claims` table with normalized wallet address, IP hash, claim timestamp, ETH amount, USDC amount, tx summary JSON
  - Suggested env/config additions:
    - faucet enabled flag
    - ETH claim amount
    - USDC claim amount
    - claim window seconds
    - max claims per wallet/IP per window
  - Done when:
    - repeated claims within the configured window are rejected with a clear error
    - successful claims reuse the existing local wallet seeding path
    - health/status metadata can indicate whether the faucet is enabled
  - Validation:
    - `npm run test --workspace @ic-automaton/indexer`

## Relevant Learnings From Phase 2

- The status-file overlay currently only applies fields that already exist on `PlaygroundMetadata`: `environmentVersion`, `maintenance`, and the reset timestamps. The optional `message` and `updatedAt` fields in the operator status file are ignored for now, so Phase 3 should extend the shared contract first if the UI needs an operator banner or status freshness indicator.
- `scripts/seed-local-wallet.mjs` writes a JSON output file on every run. Any long-lived service that shells out to it concurrently needs to pass a unique `LOCAL_EVM_SEED_OUTPUT_FILE`, or concurrent faucet claims will collide on the default `tmp/local-wallet-seed.json` path.
- The faucet’s per-IP window currently keys off Fastify `request.ip`. That works in local tests, but Phase 8 deploy work needs proxy-aware client IP forwarding/trust configured at the Caddy-to-app boundary, or all public users behind the reverse proxy will share one IP bucket.

### Phase 3 - Web app runtime behavior

- [x] **CP-05: Move the web app from hardcoded spawn-chain metadata to runtime playground metadata**
  - Files to create:
    - `apps/web/src/api/playground.ts`
    - `apps/web/src/hooks/usePlayground.ts`
  - Files to modify:
    - `apps/web/src/api/indexer.ts`
    - `apps/web/src/lib/wallet-transaction-helpers.ts`
    - `apps/web/src/lib/spawn-payment.ts`
    - `apps/web/src/App.tsx`
    - `apps/web/src/App.test.tsx`
    - `apps/web/src/lib/spawn-payment.test.ts`
  - Implement:
    - a startup fetch for `GET /api/playground`
    - a runtime chain metadata source used by wallet add/switch logic
    - a persistent environment banner showing:
      - test/playground label
      - chain name
      - last reset time
      - next reset window
      - maintenance state
      - non-durable warning
  - Important detail:
    - keep `VITE_SPAWN_*` values as fallback only, so local dev still works before indexer metadata is available
    - remove the assumption that Base always means chain ID `8453`
  - Done when:
    - `wallet_addEthereumChain` and `wallet_switchEthereumChain` use runtime metadata when present
    - the banner is visible outside the spawn wizard, not buried inside one step
  - Validation:
    - `npm run test --workspace @ic-automaton/web`
    - `npm run build --workspace @ic-automaton/web`

- [x] **CP-06: Replace the single-provider wallet hook with EIP-6963 discovery plus fallback**
  - Files to create:
    - `apps/web/src/wallet/eip6963.ts`
  - Files to modify:
    - `apps/web/src/wallet/useWalletSession.ts`
    - `apps/web/src/App.tsx`
    - `apps/web/src/components/spawn/SpawnWizard.tsx`
    - relevant web tests for wallet behavior
  - Implement:
    - EIP-6963 provider discovery
    - provider selection UI when multiple wallets are available
    - persisted preferred wallet choice in local storage
    - fallback to `window.ethereum` when the browser only exposes the legacy injection path
  - Important detail:
    - preserve the current request interface used by `spawn-payment.ts`; refactor the provider source, not the whole payment flow
  - Done when:
    - users with multiple injected wallets can choose one intentionally
    - a single-wallet browser still works without extra setup
  - Validation:
    - `npm run test --workspace @ic-automaton/web`

- [x] **CP-07: Add explicit network onboarding, faucet CTA, and failure messaging to the spawn flow**
  - Files to modify:
    - `apps/web/src/components/spawn/SpawnWizard.tsx`
    - `apps/web/src/components/spawn/steps/FundStep.tsx`
    - `apps/web/src/components/spawn/spawn-state.ts`
    - `apps/web/src/styles.css`
    - relevant web tests
  - Implement:
    - a visible "Add/Switch playground network" action
    - a visible "Get test funds" action that calls the new faucet endpoint
    - UI copy for:
      - missing wallet
      - wrong chain
      - rejected chain add/switch
      - insufficient ETH
      - insufficient USDC
      - faucet unavailable
      - session expired because of TTL or reset
    - success feedback that shows faucet tx hashes or links when available
  - Important detail:
    - do not hide faucet access behind payment submission; users should be able to fund before they click the final spawn action
    - the spawn wizard should remain usable even when the faucet is disabled
  - Done when:
    - the first-run path from wallet detection to faucet funding is one obvious flow
    - reset/maintenance messaging is visible in the wizard as well as in the global banner
  - Validation:
    - `npm run test --workspace @ic-automaton/web`

## Relevant Learnings From Phase 3

- The web app now has two chain-metadata paths by design: runtime `/api/playground` plus `VITE_SPAWN_*` fallback. Phase 8 and Phase 9 deploy/bootstrap work should keep both sourced from the same chain ID/RPC values, or first-paint wallet actions can drift from the runtime banner during indexer outages.
- EIP-6963 wallets often also expose the same provider through `window.ethereum`. The provider registry has to dedupe by provider object, not only by announced ID, or the wallet selector shows duplicate entries for the same extension.
- The wizard’s ETH/USDC sufficiency checks only become reliable after the wallet is already on the playground chain. Any later smoke or end-to-end automation should switch networks before asserting balance/faucet readiness.

### Phase 4 - Bootstrap, reset, and smoke coverage

- [x] **CP-08: Add bootstrap/reset/status scripts as the source of truth**
  - Files to create:
    - `scripts/playground-bootstrap.sh`
    - `scripts/playground-reset.sh`
    - `scripts/write-playground-status.mjs`
    - `scripts/playground-smoke.mjs`
    - `scripts/playground-smoke.sh`
  - Files to modify:
    - `scripts/start-local-evm.sh`
    - `scripts/deploy-local-escrow.mjs`
    - `scripts/render-factory-local-init-args.mjs`
    - `package.json`
  - Implement:
    - bootstrap flow that:
      - marks maintenance on
      - starts or recreates the local ICP network
      - deploys the factory canister to `local`
      - starts Anvil, or verifies that the configured Anvil service is running, in Base-fork mode with chain ID `20260326`
      - deploys escrow contracts
      - uploads the child Wasm artifact
      - writes/updates the playground status file
      - runs smoke tests
      - marks maintenance off only after smoke succeeds
    - hard reset flow that wipes the configured ICP local state dir and refreshes Anvil/fork state before re-running bootstrap
    - smoke flow that extends the existing escrow smoke script into:
      - indexer health
      - RPC gateway `eth_chainId`
      - faucet claim
      - spawn-session creation and progression
  - Important detail:
    - the scripts must accept env/config for the child Wasm path and commit SHA instead of assuming the sibling repo exists on the VPS
    - `scripts/start-local-evm.sh` should support the new chain ID without breaking local use
  - Done when:
    - one bootstrap command can recreate the playground from a fresh state directory
    - status-file maintenance mode flips automatically around reset/bootstrap
  - Validation:
    - `bash -n scripts/playground-bootstrap.sh`
    - `bash -n scripts/playground-reset.sh`
    - `sh ./scripts/playground-smoke.sh`

## Relevant Learnings From Phase 4

- Phase 4 now has two service modes by design: `playground-bootstrap.sh` can manage local `indexer` and `rpc-gateway` processes itself for repo-local bootstrap, or verify pre-existing endpoints with `PLAYGROUND_MANAGE_SERVICES=0`. Phase 5 should keep both modes on one shared env contract so bootstrap-time URLs and long-lived runtime URLs cannot drift.
- Hard resets also need to clear the indexer SQLite file, not only ICP and Anvil state. Otherwise faucet IP quotas and cached spawn-session/registry views survive the reset and diverge from the fresh chain.
- The public-path smoke uses a generated private key plus the faucet and RPC gateway, which means deploy automation needs either a fresh reset window or a non-trivial per-IP faucet budget for ops traffic. The local-dev `maxClaimsPerIp=1` default is too tight for repeated bootstrap smoke runs.

### Phase 5 - Runtime packaging and deploy contract

- [x] **CP-09: Add container/runtime assets for the VPS**
  - Files to create:
    - `apps/web/Dockerfile`
    - `apps/indexer/Dockerfile`
    - `apps/rpc-gateway/Dockerfile`
    - `ops/playground/docker-compose.yml`
    - `ops/playground/Caddyfile`
    - `ops/playground/playground.env.example`
    - `ops/playground/systemd/icp-playground.service`
    - `ops/playground/README.md`
  - Implement:
    - multi-stage images for `web`, `indexer`, and `rpc-gateway`
    - Compose services for:
      - `anvil`
      - `web`
      - `indexer`
      - `rpc-gateway`
    - optional profiles for:
      - `otterscan`
      - `monitoring`
    - static Caddy config for:
      - `playground.<domain>` -> web + indexer routes
      - `rpc.playground.<domain>` -> rpc-gateway
    - a host-managed `systemd` unit for the local ICP runtime
  - Important detail:
    - Caddy is host-managed in the preferred path, so the checked-in `Caddyfile` should assume host deployment first
    - keep secrets as file-mounted or externally injected values; do not hardcode them in Compose
  - Done when:
    - `docker compose -f ops/playground/docker-compose.yml config` succeeds
    - the checked-in ops files are enough for an operator to provision the VPS without inventing missing config structure
  - Validation:
    - `docker compose -f ops/playground/docker-compose.yml config`

## Relevant Learnings From Phase 5

- The indexer faucet path is not a pure `dist/` runtime: it shells out to [`scripts/seed-local-wallet.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/seed-local-wallet.mjs), and that script still needs a `cast` binary plus the shared deployment file. The indexer image therefore has to bundle both the script and `cast`; copying only compiled server output is not enough.
- The containerized indexer needs an explicit handoff for the resolved local factory canister ID after each bootstrap or hard reset. Writing a shared `PLAYGROUND_FACTORY_CANISTER_ID_FILE` from [`scripts/playground-bootstrap.sh`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/playground-bootstrap.sh) keeps Compose startup aligned with the host-managed ICP lifecycle without manual env edits.
- The VPS topology now makes the existing proxy/IP assumption concrete: both the faucet and the RPC gateway still key their rate limits from Fastify `request.ip`, but neither service is yet configured with `trustProxy`. Behind host-managed Caddy, Phase 10 or follow-up hardening should fix that before treating those limits as real client-IP controls.

- [x] **CP-10: Add CI/release/deploy workflow files and the VPS deploy script**
  - Files to create:
    - `.github/workflows/ci.yml`
    - `.github/workflows/deploy-soft.yml`
    - `.github/workflows/deploy-hard-reset.yml`
    - `scripts/deploy-playground-release.sh`
    - `ops/playground/release-manifest.example.json`
  - Implement:
    - CI workflow that runs:
      - `npm run lint`
      - `npm run test`
      - `cargo test -p factory`
      - `forge test --root evm`
      - image builds for the deployable apps
    - soft deploy workflow for `main`
    - manual hard reset workflow for chain/config/artifact changes
    - release manifest contract containing commit SHA, image digests, child artifact SHA, and fork metadata
    - VPS deploy script that:
      - reads the release manifest
      - pulls exact image digests
      - updates Compose services
      - invokes bootstrap/reset scripts when required
      - fails hard on failed smoke checks
  - Important detail:
    - deploy logic belongs in `scripts/deploy-playground-release.sh`, not duplicated across YAML jobs
    - the workflows should serialize deployments with `concurrency`
  - Done when:
    - the repo contains a reproducible path from merge to VPS deploy artifacts
    - a hard reset deploy can be triggered without editing workflow YAML
  - Validation:
    - `bash -n scripts/deploy-playground-release.sh`
    - CI execution on a PR is the authoritative workflow check

## Relevant Learnings From Phase 10

- Soft deploys cannot rely on container env alone for the visible release version. The status-file overlay from Phase 2 can keep serving an older `environmentVersion`, so the deploy script has to refresh the status file after a successful soft deploy.
- Hard-reset deploys with Compose-managed Anvil still need an explicit reset command wired into [`scripts/playground-reset.sh`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/playground-reset.sh). `PLAYGROUND_ANVIL_MANAGED=0` is not enough by itself once Anvil is no longer a pid-file-managed local process.
- The deploy contract is only reproducible if the manifest carries exact image refs with digests, not just tags. The web image in particular bakes runtime-facing frontend defaults at build time, so its digest is part of the release state, not a replaceable runtime detail.

## Final Acceptance Bar

The work is only done when all of the following are true:

- a browser wallet can add `Automaton Playground` with chain ID `20260326`
- `https://rpc.<domain>` answers `eth_chainId` with `0x13525e6`
- denied RPC namespaces fail at the gateway
- the web app shows playground/reset/maintenance state from `/api/playground`
- the faucet can fund a connected wallet without exposing private Anvil methods
- a user can complete the current spawn flow against the shared playground
- reset operations visibly put the environment into maintenance mode
- the deploy contract is repo-owned and does not rely on `git pull` on the VPS

## Deferred Follow-Ups

These are valid later improvements, but they should not block the first implementation pass.

- split the faucet back out of the indexer if throughput or isolation requires it
- add CAPTCHA or stronger abuse prevention
- add separate read/write RPC quotas
- add automatic backup upstream RPC failover
- add per-PR or per-user preview environments
- add a richer explorer/monitoring stack by default
