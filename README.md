# automaton-launchpad

Monorepo for the local `ic-automaton` launchpad experience.

## What is in this repo

- `apps/web`: React + Vite frontend
- `apps/indexer`: Fastify API + WebSocket service backed by SQLite
- `packages/shared`: shared TypeScript contracts
- `backend/factory`: Rust factory crate

## Prerequisites

- Node.js `>=20.19.0`
- npm `>=10`
- Rust toolchain if you want to build or test `backend/factory`

## Install dependencies

```bash
npm install
```

## Start locally

The simplest local entrypoint is:

```bash
npm run dev
```

This starts:

- the indexer with `tsx watch`
- the Vite frontend on `http://127.0.0.1:5173`
- the frontend wired to the indexer at `http://127.0.0.1:3001`

Open `http://127.0.0.1:5173`.

### Run each app separately

Indexer:

```bash
npm run dev:indexer
```

Web app:

```bash
VITE_INDEXER_BASE_URL=http://127.0.0.1:3001 \
npm run dev:web
```

Useful optional environment variables for the indexer:

- `HOST`: defaults to `0.0.0.0`
- `PORT`: defaults to `3001`
- `INDEXER_DB_PATH`: override the SQLite file path
- `INDEXER_FACTORY_CANISTER_ID`: factory canister ID exposed by `/health`
- `INDEXER_INGESTION_NETWORK_TARGET`: override `network.target` for deployment/runtime selection
- `INDEXER_INGESTION_LOCAL_HOST`: override `network.local.host` when pointing at a replica host
- `INDEXER_INGESTION_LOCAL_PORT`: override `network.local.port` when pointing at a replica port

Indexer targeting defaults come from the typed config file at `apps/indexer/src/indexer.config.ts`:

- `canisterIds`
- `network.target`
- `network.local.host`
- `network.local.port`

The indexer derives `icHost` from that config. Runtime env overrides are limited to the deployment-facing network selector and local replica address; the canister ID list still comes from the typed config file.

Useful optional environment variables for the root runner:

- `WEB_HOST`: defaults to `127.0.0.1`
- `WEB_PORT`: defaults to `5173`
- `INDEXER_HOST`: defaults to `127.0.0.1`
- `INDEXER_PORT`: defaults to `3001`
- `VITE_INDEXER_BASE_URL`: defaults to `http://127.0.0.1:3001`

Health check:

```bash
curl http://127.0.0.1:3001/health
```

## Notes about the current local setup

- `apps/indexer` runs directly from TypeScript via `tsx watch src/server.ts`.
- If `VITE_INDEXER_BASE_URL` is not set when running the web app separately, the frontend will request `/api/...` from the Vite origin instead of the indexer.
- The app can start with an empty indexer database; you will still get the UI shell and an empty automaton list.

## Useful commands

```bash
npm test
npm run lint
cargo test -p factory
```

## Factory crate

The Rust factory code lives in `backend/factory` and can be tested independently:

```bash
cargo test -p factory
```

This README only documents the local web + indexer loop. It does not cover ICP deployment or wiring a live factory canister into the UI.
