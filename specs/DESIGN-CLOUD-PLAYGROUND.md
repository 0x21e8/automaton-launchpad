# Design: Cloud Playground for Local ICP + Base-Fork Anvil

**Status:** Proposed
**Date:** 2026-03-26
**Audience:** launchpad engineers and operators
**Scope:** a simple public playground/testing environment that lets users connect browser-extension wallets, configure spawn settings, and fund automatons against a cloud-hosted test stack

## Summary

The simplest credible v1 is a single shared playground environment on one cloud VM:

- keep the ICP local network private
- keep raw Anvil private
- expose only the web app, indexer API, and a filtered public EVM RPC URL over HTTPS
- add a small faucet service so users can fund their own extension-wallet address with test ETH and USDC
- reset the environment on a scheduled basis and make that reset visible in the UI

This shape fits the current repo better than Kubernetes or per-PR ephemeral environments. It also addresses the main product constraint: browser wallets can only talk to a public RPC, but Anvil is a development node with admin-style RPC methods that must not be exposed directly.

## Problem

We want a cloud-hosted environment where users can:

- open the launchpad in a browser
- connect an extension wallet such as MetaMask
- add/switch to the playground EVM network
- receive test funds
- create spawn sessions and pay for them on the forked Base network
- observe the resulting automaton lifecycle through the existing web and indexer flow

At the same time, the environment must stay simple to operate and reasonably safe to expose on the public internet.

## Goals

- Use a local ICP network for the factory canister and child automatons.
- Use Anvil in Base-fork mode for the payment path.
- Let users use extension wallets instead of hard-coded dev keys.
- Reuse as much of the current repo as possible.
- Keep the operator workflow simple enough for one shared playground.
- Make resets and non-durable behavior explicit in the UX.

## Non-Goals

- Production hosting for real value.
- Strong multi-tenant isolation between playground users.
- A permanent environment with durable guarantees.
- A full blockchain explorer stack in v1.
- Public exposure of the ICP replica or raw Anvil admin surface.

## Current Repo Fit

The existing repo already provides most of the application pieces:

- [`scripts/start-local-evm.sh`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/start-local-evm.sh) starts Anvil with configurable host, port, mnemonic, and chain ID.
- [`scripts/deploy-local-escrow.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/deploy-local-escrow.mjs) supports `base-fork` mode and injects mock USDC bytecode at Base USDC’s canonical address on the fork.
- [`scripts/seed-local-wallet.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/seed-local-wallet.mjs) already mints ETH and USDC to a chosen EVM address and is the natural starting point for a faucet service.
- [`scripts/upload-factory-artifact.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/upload-factory-artifact.mjs) already handles child Wasm upload into the factory canister.
- [`apps/web/src/lib/spawn-payment.ts`](/Users/domwoe/Dev/projects/automaton-launchpad/apps/web/src/lib/spawn-payment.ts) already performs `wallet_addEthereumChain` and `wallet_switchEthereumChain`.
- [`apps/web/src/wallet/useWalletSession.ts`](/Users/domwoe/Dev/projects/automaton-launchpad/apps/web/src/wallet/useWalletSession.ts) still assumes `window.ethereum`, which is acceptable for local MetaMask testing but weak for public multi-wallet support.
- [`icp.yaml`](/Users/domwoe/Dev/projects/automaton-launchpad/icp.yaml) already declares a `local` environment for the factory canister.

The main gaps are infrastructure and public-wallet UX, not core product flow.

## Key Constraints and Best-Practice Inputs

### ICP local network

- PocketIC-backed local networks are deterministic and intentionally strip out consensus and networking. That is good for a playground, but it means the environment should be treated as disposable and not as a production-like subnet.
- The repo uses `icp`, not `dfx`, and the local network is project-local. For any future multi-environment setup, each environment needs its own isolated project root and `ICP_HOME`.

### Wallet network UX

- `wallet_addEthereumChain` requires valid RPC URLs and wallets must reject `http:` URLs, so the public RPC URL must be HTTPS.
- Wallets must not add the same chain ID multiple times, and they validate that the RPC endpoint returns the same `eth_chainId`, so the playground needs a unique, stable chain ID. A public playground must not pretend to be Base mainnet with chain ID `8453`.
- Users may have multiple injected wallets. Public dapps should implement EIP-6963 discovery instead of relying only on `window.ethereum`.

### Anvil exposure

- Anvil is a development node and supports `anvil_*` custom RPC methods such as impersonation, mining control, and state mutation.
- Raw Anvil must therefore stay private. Public users should hit a filtered RPC gateway that only forwards the subset of Ethereum JSON-RPC methods needed by wallets and read-only tooling.

## Alternatives

### Option A: One shared long-lived playground

Description:

- one cloud VM
- one ICP local network
- one Base-fork Anvil instance
- one shared web + indexer deployment
- one public HTTPS RPC endpoint fronting a filtered gateway

Pros:

- simplest operator model
- stable wallet UX because the chain ID and RPC URL stay the same
- cheapest infrastructure footprint
- best fit for demos and ad hoc testing

Cons:

- users share chain state and canister namespace
- resets affect everyone
- abuse controls matter more because all users hit the same environment

Assessment:

- recommended v1

### Option B: Ephemeral preview environments per branch or per session

Description:

- each preview gets its own VM or container group, its own ICP local network, and its own Anvil fork

Pros:

- clean isolation
- deterministic per-PR validation
- safer for internal testing of breaking changes

Cons:

- significantly more infrastructure and orchestration
- much worse wallet UX because each preview needs its own chain metadata and likely its own chain ID
- harder to share with external testers

Assessment:

- good internal follow-up, bad first public playground

### Option C: Use mainnet-backed ICP playgrounds instead of a local ICP network

Description:

- deploy the factory or a custom playground to ICP mainnet while still using a forked EVM path

Pros:

- better fidelity for ICP networking and replica behavior
- fewer local-replica lifecycle issues

Cons:

- violates the explicit requirement to use a local ICP network
- introduces cycles, governance, and onchain operational concerns that are unnecessary for a simple playground

Assessment:

- valid product alternative, rejected for this scope

## Recommendation

Use Option A for v1:

- a single shared playground on one VM
- raw Anvil and ICP local replica bound to loopback only
- Caddy or Nginx for TLS termination and host routing
- a small `rpc-gateway` service in this repo that allowlists safe RPC methods
- a small `faucet` service in this repo that reuses the existing seeding logic
- scheduled resets with a visible environment banner in the UI

This is the highest-leverage design because it preserves simple wallet onboarding while keeping the unsafe dev-node surface private.

## Containerization Recommendation

Yes, but not by copying the prior `0x21` stack shape.

The best v1 is a selective split:

- use Docker Compose for the long-lived application services
- keep the TLS edge simple and static
- treat bootstrap and reset as one-shot jobs
- do not blindly persist IC tool caches

### What the prior `0x21` stack got right

The prior project demonstrates several patterns that are worth reusing in spirit:

- one single-host Compose graph for a demo environment
- optional tooling and observability services alongside core services
- named volumes for runtime state
- one-shot bootstrap/build jobs instead of hiding deployment inside random container startup commands
- an explicit proxy boundary in front of IC services

Those are good patterns for this repo too.

### What not to copy from the prior stack

The prior stack also includes patterns that are wrong for this playground if copied literally:

- public raw Anvil exposure behind a reverse proxy
- Traefik auto-discovery via Docker labels and a mounted Docker socket
- sharing frontend build output across long-lived containers via volumes when simple multi-stage images would do
- persisting broad local-IC tool state without a careful cleanup story

The strongest signal here is operational, not stylistic: the prior file explicitly comments that persisting DFX home state caused cache staleness and “canister not found” failures after clean starts. This repo should assume the same class of failure is possible for `icp` local state and cache directories unless persistence is narrowly scoped.

### Recommended container boundary

Host-managed with `systemd`:

- `caddy` for TLS termination and host routing
- `icp local` network runtime

Compose-managed:

- `anvil`
- `rpc-gateway`
- `indexer`
- `web`
- `faucet`

Compose-managed optional profiles:

- `otterscan`
- `monitoring`
- `playground-bootstrap`
- `playground-reset`

Why this split:

- Docker Compose is well-suited to single-host deployments and optional service profiles.
- Caddy’s own docs recommend running it as a Linux service under `systemd`, which is a better fit for a small VM than introducing a dynamic Docker-aware proxy.
- Keeping Caddy outside Docker avoids mounting the Docker socket into a public-facing proxy.
- Keeping `icp local` outside Compose reduces the amount of opaque launcher and cache state hidden inside containers, while still allowing the rest of the stack to be reproducible.

### Acceptable all-Compose variant

If full containerization is a hard requirement, the acceptable variant is:

- run `caddy` in Compose with a static `Caddyfile`
- persist Caddy `/data` and `/config`
- keep `icp local` in its own dedicated container with a dedicated `ICP_HOME`
- still avoid Traefik + Docker socket as the default design

This variant is workable, but it is not the simplest v1 operating model.

### Recommended Compose shape

Use Compose as a process supervisor for runtime services, not as a substitute for deploy logic.

Core services without profiles:

- `anvil`
- `rpc-gateway`
- `indexer`
- `web`
- `faucet`

Tooling services with profiles:

- `otterscan` under `explorer`
- `prometheus`, `grafana`, and log shipping under `monitoring`
- `playground-bootstrap` and `playground-reset` under `ops`

Recommended Compose behaviors:

- define `healthcheck` on `anvil`, `rpc-gateway`, `indexer`, and `faucet`
- use long-form `depends_on` with `condition: service_healthy`
- use `condition: service_completed_successfully` for one-shot bootstrap steps
- keep core services unprofiled so `docker compose up -d` brings up the actual playground
- put optional tools behind profiles so they do not increase the default blast radius
- set an explicit Compose project name so future parallel playgrounds or preview environments can coexist cleanly without resource collisions

### Image strategy

Use multi-stage Dockerfiles and CI-built images.

For this repo, that means:

- `web`: build with Node/Vite, serve static assets from a minimal web image
- `indexer`: build TypeScript once, run compiled output with Node
- `rpc-gateway` and `faucet`: small dedicated runtime images

Do not copy the prior project’s shared `dist`-volume pattern unless a build step genuinely must emit artifacts for multiple runtime containers. For this repo, multi-stage images are simpler and less fragile.

### Persistence strategy

Persist:

- SQLite database
- Anvil state or fork cache if we want faster restart and more stable explorer history
- deployment manifests and reset metadata
- Caddy data/config if Caddy is containerized

Do not persist blindly:

- all `ICP_HOME` content
- local-network cache directories used only as tool scratch space
- arbitrary build caches

Recommended IC rule:

- persist only the minimum IC directories required for the chosen reset model
- explicitly clear local-network cache state during hard resets

### Secrets and configuration

Use Compose secrets or file-mounted secrets for:

- upstream Base RPC credentials
- faucet keys or privileged funding keys
- any provider API keys used by operator services

Do not treat environment variables as the default secret channel just because they are convenient.

Use ordinary environment variables only for non-secret runtime config such as:

- public hostnames
- chain name and chain ID
- port numbers
- feature flags

### Reverse proxy choice

Prefer static Caddy over Traefik for this repo.

Rationale:

- fewer moving parts
- no Docker-label routing logic spread across services
- no need for Docker socket access
- simpler host-level maintenance on a single VM

If we later need dynamic per-preview routing, we can revisit Traefik or another dynamic control plane. That is not a v1 requirement.

## Proposed Architecture

```text
                         Public Internet
                                |
                    +------------------------+
                    |   TLS Proxy / Router   |
                    |  play.* and rpc.*      |
                    +-----------+------------+
                                |
                +---------------+----------------+
                |                                |
        https://play...                   https://rpc...
                |                                |
        +-------+--------+               +-------+--------+
        | web static app |               | rpc-gateway    |
        | + indexer API  |               | method allowlist|
        +-------+--------+               +-------+--------+
                |                                |
                |                         localhost:8545
                |                                |
        +-------+--------+               +-------+--------+
        | indexer        |               | anvil base fork|
        | spawn/api/ws   |               | private only    |
        +-------+--------+               +-----------------+
                |
         localhost:8000
                |
        +-------+--------+
        | icp local      |
        | factory + child|
        | canisters      |
        +----------------+
```

## Public and Private Surfaces

Public:

- `https://playground.<domain>` for the web app and indexer routes
- `https://rpc.playground.<domain>` for wallet RPC traffic
- optional `POST /api/faucet` on the play domain

Private:

- ICP local replica
- raw Anvil port
- operator shell access
- artifact upload scripts
- any admin or reset endpoints

Rejected shortcut:

- do not expose `anvil` directly on `0.0.0.0`

That shortcut looks tempting, but it combines a public wallet RPC with a dev node that supports state-mutation admin methods. The safe boundary must be a gateway, not CORS. CORS is insufficient because wallets and extensions do not present a single trusted browser origin.

## Recommended Service Layout

### 1. `icp-local`

Responsibility:

- run the project-local ICP network
- deploy or reinstall the factory canister
- host spawned child canisters

Notes:

- keep it private to the VM
- give it its own persistent data directory and `ICP_HOME`
- on a hard reset, wipe that environment explicitly instead of attempting partial recovery

### 2. `anvil`

Responsibility:

- run a Base fork for the EVM payment path

Recommended config:

- bind to `127.0.0.1`
- use `--fork-url <base-rpc>`
- use `--fork-block-number <pinned-block>`
- use a dedicated playground chain ID, not `8453`
- persist the fork cache and any saved state on disk where practical

Notes:

- the current local dev default of chain ID `8453` is acceptable on a laptop but wrong for a public playground because it impersonates Base mainnet
- if Base-specific fee semantics become relevant, enable Anvil’s Optimism mode in a follow-up; for the current escrow path, standard fork mode is likely sufficient

### 3. `rpc-gateway`

Responsibility:

- expose a wallet-safe RPC endpoint over HTTPS
- forward only approved JSON-RPC methods to local Anvil
- rate-limit abusive callers

Suggested allowlist:

- `eth_chainId`
- `net_version`
- `eth_blockNumber`
- `eth_call`
- `eth_estimateGas`
- `eth_feeHistory`
- `eth_gasPrice`
- `eth_maxPriorityFeePerGas`
- `eth_getBalance`
- `eth_getCode`
- `eth_getTransactionCount`
- `eth_getBlockByNumber`
- `eth_getTransactionByHash`
- `eth_getTransactionReceipt`
- `eth_getLogs`
- `eth_sendRawTransaction`

Suggested denylist prefix rules:

- `anvil_*`
- `hardhat_*`
- `debug_*`
- `admin_*`
- `personal_*`
- `txpool_*`
- `evm_*`

Why a gateway instead of exposing Anvil:

- inference from Foundry docs: Anvil’s custom RPC surface is deliberately powerful for local development, so exposing it to arbitrary internet users would let them interfere with the shared chain

### 4. `faucet`

Responsibility:

- mint or transfer test ETH and test USDC to a user’s connected wallet address

Implementation shape:

- expose `POST /api/faucet`
- accept a connected wallet address
- reuse the existing mint/fund logic from [`scripts/seed-local-wallet.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/seed-local-wallet.mjs)
- return tx hashes and resulting balances

Guardrails:

- rate-limit by address and IP
- cap claims per time window
- optionally require a lightweight captcha if abuse appears
- show current faucet limits in the UI

### 5. `indexer`

Responsibility:

- unchanged core role
- remains the public read/proxy layer for factory state

Additional v1 responsibilities:

- publish playground status metadata
- publish reset schedule and last reset time
- publish wallet network metadata if we want runtime config instead of build-time env vars

### 6. `web`

Responsibility:

- serve the existing app as static assets, not as a Vite dev server

Required follow-ups:

- replace direct `window.ethereum` dependence with EIP-6963 discovery plus a `window.ethereum` fallback
- add a prominent “Add playground network” and “Get test funds” flow
- show a non-durable environment banner

## UX Design Requirements

### Wallet onboarding

The first-run path should be:

1. Detect available wallets with EIP-6963.
2. Let the user choose MetaMask, Rabby, or another provider if multiple are installed.
3. Call `wallet_addEthereumChain` with the public HTTPS RPC URL and stable playground chain ID.
4. Call `wallet_switchEthereumChain`.
5. Offer faucet funding if ETH or USDC is below the minimum spawn threshold.
6. Continue into the existing spawn wizard.

This avoids asking users to manually copy RPC values into wallet settings.

### Environment clarity

The UI should always show:

- “Playground / test environment”
- current chain name
- last reset time
- next scheduled reset window
- a statement that canisters and balances are non-durable

Without this, users will misread the environment as a durable staging network.

### Failure messaging

The wallet/payment flow should surface distinct messages for:

- unsupported or missing wallet
- wrong chain selected
- chain add rejected by the wallet
- insufficient ETH for gas
- insufficient USDC for deposit
- faucet temporarily unavailable
- session expired because the playground reset or the TTL elapsed

### Multi-device expectations

Custom networks are not automatically synced across all wallet installations. If a user opens the playground on a second browser profile or reinstalls their wallet extension, they may need to add the network again. The UI should treat this as normal and make re-adding one click.

## Edge Cases and Mitigations

### 1. Public chain ID collision

Risk:

- using Base mainnet’s chain ID (`8453`) on a fake public fork confuses wallets and users

Mitigation:

- choose one dedicated chain ID for the playground and document it everywhere
- set the chain name to something explicit such as `Automaton Playground`

### 2. Wallet sees the wrong RPC metadata

Risk:

- `wallet_addEthereumChain` fails if `eth_chainId` returned by the RPC does not match the requested chain ID

Mitigation:

- configure the gateway and Anvil from one source of truth
- add a deployment smoke check that compares configured chain ID with `eth_chainId`

### 3. A user has multiple injected wallets

Risk:

- `window.ethereum` can select the wrong provider or change based on extension load order

Mitigation:

- adopt EIP-6963 provider discovery
- persist the user’s chosen wallet locally in the app

### 4. Faucet abuse

Risk:

- public users can drain test balances or spam the chain

Mitigation:

- rate-limit by IP and address
- set modest per-claim amounts
- keep faucet balances visible in health checks
- reset the environment on schedule

### 5. Public RPC abuse

Risk:

- users flood the shared chain with junk transactions or expensive RPC calls

Mitigation:

- rate-limit the gateway
- deny non-essential RPC namespaces
- enforce request-body size limits
- optionally separate write and read quotas

### 6. Base upstream RPC outage or rate limiting

Risk:

- Anvil fork startup or refork fails

Mitigation:

- pin the fork block for the shared environment
- keep one backup upstream RPC URL
- persist cache on disk
- make the environment fail closed and show maintenance if the fork cannot be rebuilt

### 7. ICP local network crash or stale state

Risk:

- the environment enters a half-alive state after a launcher failure

Mitigation:

- supervise the network with `systemd`
- keep its state in an isolated directory
- prefer full reset over ad hoc manual repair for user-facing recovery

### 8. Deploys interrupt active sessions

Risk:

- users pay or retry during a reset window and get a broken experience

Mitigation:

- enter maintenance mode before hard reset deploys
- disable new session creation during maintenance
- drain indexer/WebSocket traffic cleanly
- show a clear banner before and during resets

### 9. Anvil history reset versus wallet history

Risk:

- after a hard reset, wallet transaction history may show old playground transactions that no longer exist on the fresh chain state

Mitigation:

- keep the chain ID stable, but reset infrequently and visibly
- show “environment was reset” in the UI after each hard reset
- avoid pretending the environment is durable

### 10. Shared-state interference between users

Risk:

- one user can affect the shared fork in ways that confuse others

Mitigation:

- accept this in v1 as a playground tradeoff
- keep resets regular
- reserve per-user preview environments for future internal testing, not for public v1

## Deployment and Reset Pipeline

### Pipeline Principles

- one scriptable bootstrap path for local and cloud
- explicit distinction between soft deploys and hard reset deploys
- smoke tests must run against the real public endpoints before traffic is considered healthy

### Proposed bootstrap entrypoint

Introduce a new top-level script such as `scripts/playground-bootstrap.sh` that:

1. Starts or resets the project-local ICP network.
2. Builds and deploys the factory canister to `local`.
3. Starts Anvil in Base-fork mode with the configured chain ID and pinned block.
4. Deploys the escrow contracts and writes a deployment manifest.
5. Uploads the child automaton Wasm artifact into the factory.
6. Starts the indexer and the RPC gateway.
7. Builds the web app and reloads the static host.
8. Runs smoke tests.

This script becomes the operational source of truth instead of trying to reuse `scripts/dev.sh`, which is intentionally a local development helper.

### CI pipeline

On every PR:

- run `npm run lint`
- run `npm run test`
- run `cargo test -p factory`
- run `forge test --root evm`
- optionally run a smoke bootstrap inside CI for internal confidence

On merge to `main`:

- build and publish versioned container images for `web`, `indexer`, `rpc-gateway`, and `faucet`
- fetch the pinned child Wasm artifact and manifest from the `ic-automaton` release pipeline
- create a release manifest that records commit SHA, image digests, child artifact SHA, and fork configuration
- deploy the new release to the playground VPS
- verify health and smoke tests

### Automatic GitHub deployment to the VPS

Recommended deployment model:

- GitHub-hosted Actions runners perform CI and image builds
- GitHub Container Registry stores the runtime images
- a GitHub Actions deploy job connects to the VPS over SSH
- the VPS runs an idempotent deploy script that applies the new release

Recommended workflow split:

1. `ci.yml`
   - trigger on pull requests and pushes
   - run lint, tests, and container builds
2. `deploy-soft.yml`
   - trigger automatically on pushes to `main`
   - deploy application/runtime changes that do not require chain reset
3. `deploy-hard-reset.yml`
   - trigger only via `workflow_dispatch`
   - used for factory/schema/fork changes, child artifact resets, or manual fork roll-forward

Why this split:

- automatic deployment is desirable for routine app changes
- hard reset deploys can invalidate active sessions and should not happen on every merge
- fork roll-forward was already decided to be manual, and the deployment pipeline should reflect that decision

### Recommended GitHub Actions design

For the deploy workflows:

- use a dedicated GitHub environment such as `playground-vps`
- store SSH host, user, key, and registry credentials as environment secrets
- use workflow or job `concurrency` so only one playground deployment runs at a time
- pin third-party actions to commit SHAs rather than mutable tags

Recommended build/publish flow:

1. Build immutable images for `web`, `indexer`, `rpc-gateway`, and `faucet`.
2. Push them to `ghcr.io` with both commit-SHA tags and stable channel tags such as `main`.
3. Capture the pushed digests and write a release manifest artifact.
4. Pass that manifest into the deploy job.

Recommended deploy flow:

1. SSH to a non-root deploy user on the VPS.
2. Upload or fetch the release manifest.
3. Log in to GHCR on the VPS.
4. Pull exact image digests from the manifest, not mutable tags.
5. Run `docker compose up -d` for the Compose-managed services.
6. Run post-deploy health checks and smoke checks.
7. Mark the deployment successful only after those checks pass.

Why image digests matter:

- they make the deploy reproducible
- they prevent “tag drift” between what CI built and what the VPS actually pulled
- they give us a concrete release record for rollback/debugging

### Recommended VPS-side deploy contract

The VPS should expose one operator-owned script such as `scripts/deploy-playground-release.sh` that:

- reads a release manifest
- updates only the Compose-managed services for soft deploys
- optionally enters maintenance mode for hard reset deploys
- invokes `scripts/playground-bootstrap.sh` or `scripts/playground-reset.sh` when required
- runs smoke tests
- exits non-zero on any failed health check

The GitHub deploy job should call that script over SSH rather than embedding all deploy logic directly in workflow YAML.

Rejected shortcut:

- do not deploy by running `git pull` on the VPS and rebuilding ad hoc in place

That shortcut is easy to start with but weak operationally:

- builds become non-reproducible
- server state leaks into the build result
- rollbacks are slower and less trustworthy
- deploys are harder to audit

### GitHub-hosted runners vs self-hosted runner on the VPS

Recommendation:

- use GitHub-hosted runners for CI and deployment orchestration
- do not run a repository self-hosted runner on the same public VPS in v1

Rationale:

- GitHub-hosted runners are fresh VMs for each job, which reduces runner state leakage
- GitHub warns that self-hosted runners on public repositories are dangerous because forked pull requests can execute code on the runner machine
- even on private repos, colocating a self-hosted runner with the playground increases blast radius if a workflow or dependency is compromised

If we ever need a self-hosted runner later, it should live on a separate administrative box, not on the playground VM itself.

### Deploy approvals and protections

If the repository plan and visibility allow it, configure the GitHub environment with:

- deployment branch restrictions
- required reviewers for production-like deployments
- optional wait timer for hard reset workflows

At minimum, even without GitHub environment protection rules, the workflow should still enforce:

- serialized deployments via `concurrency`
- manual approval for `deploy-hard-reset.yml`
- explicit environment-specific secrets

### Child artifact pipeline

Because the child automaton Wasm lives outside this repo, the cleanest contract is:

- `ic-automaton` CI publishes a versioned Wasm artifact plus a manifest containing commit SHA and sha256
- `automaton-launchpad` deploy consumes that manifest
- the deploy step calls [`scripts/upload-factory-artifact.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/upload-factory-artifact.mjs) with the artifact path and commit SHA

This is simpler and more auditable than rebuilding the child canister ad hoc on the playground VM.

### Soft deploy versus hard reset deploy

Soft deploy:

- web and indexer only
- no chain reset
- use when contracts, canister layout, and fork config are unchanged

Hard reset deploy:

- restart ICP local network
- rebuild or reset Anvil fork
- redeploy escrow and factory
- reupload child artifact
- rerun smoke tests

Recommendation:

- treat most early playground deploys as hard reset deploys
- move to soft deploys only after the environment and artifact contracts stabilize

## Smoke Tests

Minimum required smoke checks after each deploy:

- `icp network ping local`
- indexer `/health`
- RPC gateway `eth_chainId`
- RPC gateway `eth_blockNumber`
- create and fund a test wallet through the faucet
- deploy escrow and verify deposit/release using the existing local escrow smoke flow
- create a spawn session through the indexer and confirm the session progresses

The current [`scripts/smoke-local-escrow.mjs`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/smoke-local-escrow.mjs) is a good starting point but should be extended into an end-to-end spawn smoke test.

## Operational Best Practices

- Use a dedicated subdomain for the RPC endpoint and always serve it over HTTPS.
- Keep raw Anvil and ICP ports on loopback only.
- Never expose admin or reset actions on the public internet.
- Keep persistent storage for SQLite, ICP local state, deployment manifests, and Anvil cache.
- Publish a single environment version string in the UI and logs.
- Emit structured logs for gateway denials, faucet requests, spawn-session failures, and reset events.
- Put the environment into maintenance mode before hard resets.
- Prefer a small VM and `systemd` for v1 over Kubernetes.

## Suggested V1 Deliverables

Infrastructure:

- one VM
- one TLS proxy
- one public web hostname
- one public RPC hostname
- persistent disk

Repo additions:

- `apps/rpc-gateway/` or an indexer-hosted RPC gateway module
- faucet endpoint or small sidecar service
- `scripts/playground-bootstrap.sh`
- `scripts/playground-reset.sh`
- runtime or build-time playground metadata config

Web follow-ups:

- EIP-6963 wallet discovery
- one-click add/switch network
- faucet CTA and balance checks
- reset-awareness banner

## Confirmed Decisions

- Include Otterscan in v1 as an optional but recommended service in the deployed playground.
- Keep the faucet open rather than gating it behind sign-in in v1.
- Treat fork roll-forward as a manual operator action, not an automatic schedule.
- Do not build internal preview environments with unique chain IDs for this project.
- Use GitHub Actions for automatic soft deployment to the VPS on `main`, with manual `workflow_dispatch` for hard reset deploys.

## References

- EIP-3085 `wallet_addEthereumChain`: https://eips.ethereum.org/EIPS/eip-3085
- EIP-3326 `wallet_switchEthereumChain`: https://eips.ethereum.org/EIPS/eip-3326
- EIP-6963 multi-wallet injected provider discovery: https://eips.ethereum.org/EIPS/eip-6963
- Docker Compose: single-host deployments and why Compose is a good fit: https://docs.docker.com/compose/intro/features-uses/
- Docker Compose: production guidance: https://docs.docker.com/compose/how-tos/production/
- Docker Compose: startup ordering with `service_healthy` and `service_completed_successfully`: https://docs.docker.com/compose/how-tos/startup-order/
- Docker Compose: service profiles: https://docs.docker.com/compose/how-tos/profiles/
- Docker Compose: project naming for isolated environments: https://docs.docker.com/compose/how-tos/project-name/
- Docker Compose: secrets: https://docs.docker.com/compose/how-tos/use-secrets/
- Docker Build overview, including multi-stage builds: https://docs.docker.com/build/
- GitHub Actions workflow syntax, including `concurrency`: https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions
- GitHub deployment environments: https://docs.github.com/actions/deployment/environments
- GitHub deployments and environment protection rules: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- GitHub tutorial for publishing Docker images: https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images
- GitHub-hosted runners: https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners
- GitHub self-hosted runner warning for public repos: https://docs.github.com/en/actions/how-tos/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners
- MetaMask support: custom networks and custom RPC URLs: https://support.metamask.io/configure/networks/how-to-add-a-custom-network-rpc/
- MetaMask article encouraging EIP-6963 adoption: https://metamask.io/en-GB/news/how-to-implement-eip-6963-support-in-your-web3-dapp
- Foundry Anvil reference: https://getfoundry.sh/anvil/reference/
- Caddy runtime guidance, including Linux service usage and Docker Compose notes: https://caddyserver.com/docs/running
- Internet Computer PocketIC overview: https://docs.internetcomputer.org/building-apps/test/pocket-ic
- Internet Computer deploy docs, including custom playground and custom local-network alternatives: https://docs.internetcomputer.org/building-apps/developing-canisters/deploy
