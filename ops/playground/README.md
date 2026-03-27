# Playground VPS Runtime

This directory is the checked-in runtime contract for the shared playground VPS:

- `docker-compose.yml` manages `anvil`, `web`, `indexer`, and `rpc-gateway`
- `Caddyfile` is the host-managed TLS/router config
- `systemd/icp-playground.service` keeps the local ICP runtime outside Docker
- `playground.env.example` is the shared env contract for Compose, Caddy, `systemd`, and the bootstrap/reset scripts

For the first-time machine setup, use [VPS-SETUP.md](/Users/domwoe/Dev/projects/automaton-launchpad/ops/playground/VPS-SETUP.md). This README stays focused on the runtime contract and the steady-state deploy model.

If the VPS is on your Tailnet, the setup guide now treats Tailscale as the preferred admin path for SSH and deploy traffic, while keeping the user-facing web and RPC hostnames public.

## Host layout

Use one operator-owned env file, for example `/etc/automaton-playground/playground.env`, plus one state tree such as `/srv/automaton-playground/`.

The example env keeps these host-written files under `PLAYGROUND_STATE_DIR` so the host scripts and the containerized indexer read the same paths:

- `playground-status.json`
- `factory-canister-id.txt`
- `local-escrow-deployment.json`
- `indexer.sqlite`

## Install

1. Copy and edit the shared env file.

```sh
sudo install -d /etc/automaton-playground /srv/automaton-playground/state /srv/automaton-playground/services /srv/automaton-playground/artifacts
sudo cp ops/playground/playground.env.example /etc/automaton-playground/playground.env
sudo ${EDITOR:-vi} /etc/automaton-playground/playground.env
```

2. Install the ICP `systemd` unit and start it.

```sh
sudo cp ops/playground/systemd/icp-playground.service /etc/systemd/system/icp-playground.service
sudo systemctl daemon-reload
sudo systemctl enable --now icp-playground
```

3. Make the same env file available to Caddy, then install the checked-in Caddy config.

```sh
sudo systemctl edit caddy
```

Add:

```ini
[Service]
EnvironmentFile=/etc/automaton-playground/playground.env
```

Then:

```sh
sudo cp ops/playground/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

4. Validate the Compose file and start the core runtime services.

```sh
docker compose --env-file /etc/automaton-playground/playground.env -f ops/playground/docker-compose.yml config
docker compose --env-file /etc/automaton-playground/playground.env -f ops/playground/docker-compose.yml up -d
```

## Bootstrap and Reset

Load the same env file before running the repo-owned bootstrap/reset scripts:

```sh
set -a
. /etc/automaton-playground/playground.env
set +a
```

With the example env, the VPS mode is:

- `PLAYGROUND_MANAGE_SERVICES=0`
- `PLAYGROUND_ANVIL_MANAGED=0`

That means:

- Compose owns `anvil`, `web`, `indexer`, and `rpc-gateway`
- `icp-playground.service` owns the local ICP runtime
- `scripts/playground-bootstrap.sh` deploys the factory/escrow stack, writes `factory-canister-id.txt`, waits for the loopback services to become healthy, and runs smoke checks

Run:

```sh
sh ./scripts/playground-bootstrap.sh
```

Hard reset:

```sh
sh ./scripts/playground-reset.sh
```

## Optional Profiles

Otterscan is intentionally loopback-only in this layout because raw Anvil stays private. If you enable it, use SSH tunnels for operator access.

```sh
docker compose --env-file /etc/automaton-playground/playground.env -f ops/playground/docker-compose.yml --profile otterscan up -d otterscan
```

Grafana is also profile-gated and loopback-only:

```sh
docker compose --env-file /etc/automaton-playground/playground.env -f ops/playground/docker-compose.yml --profile monitoring up -d grafana
```

## Release Deploys

Phase 10 adds a manifest-driven deploy entrypoint at [`scripts/deploy-playground-release.sh`](/Users/domwoe/Dev/projects/automaton-launchpad/scripts/deploy-playground-release.sh).

The contract is:

- build and push exact image digests for `web`, `indexer`, and `rpc-gateway` via the reusable `Publish Playground Images` workflow
- write a release manifest shaped like [`ops/playground/release-manifest.example.json`](/Users/domwoe/Dev/projects/automaton-launchpad/ops/playground/release-manifest.example.json)
- run the deploy script on the VPS with the shared env file already in place

Manual example:

```sh
set -a
. /etc/automaton-playground/playground.env
set +a

bash ./scripts/deploy-playground-release.sh --manifest /path/to/release-manifest.json
```

If `GHCR_USERNAME` and `GHCR_TOKEN` are exported, the deploy script logs into `ghcr.io` before pulling the exact image digests from the manifest.

The script records each applied manifest under `PLAYGROUND_RELEASES_DIR` and keeps `current.json` there as the latest deployed manifest.

If you want to publish the runtime images without touching the VPS, use the GitHub Actions workflow [`Publish Playground Images`](../../.github/workflows/publish-playground-images.yml). It pushes the `web`, `indexer`, and `rpc-gateway` images to GHCR and uploads:

- `playground-image-manifest`
- `playground-image-refs`

Those artifacts are the source of truth for the digest-pinned `PLAYGROUND_WEB_IMAGE`, `PLAYGROUND_INDEXER_IMAGE`, and `PLAYGROUND_RPC_GATEWAY_IMAGE` values used during VPS setup.

## Notes

- The Compose file is written for a Linux VPS. `indexer` uses host networking so it can reach the host-managed local ICP replica on `127.0.0.1`.
- The containerized indexer waits for `PLAYGROUND_FACTORY_CANISTER_ID_FILE` by default. That file is written by `scripts/playground-bootstrap.sh` after the factory canister is deployed or reinstalled.
- `PLAYGROUND_WEB_IMAGE`, `PLAYGROUND_INDEXER_IMAGE`, and `PLAYGROUND_RPC_GATEWAY_IMAGE` should point at CI-built images. Do not rebuild ad hoc on the VPS once Phase 10 release automation lands.
