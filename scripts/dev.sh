#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DEPLOYMENT_FILE=${LOCAL_EVM_DEPLOYMENT_FILE:-"$ROOT_DIR/tmp/local-escrow-deployment.json"}

INDEXER_HOST=${INDEXER_HOST:-127.0.0.1}
INDEXER_PORT=${INDEXER_PORT:-3001}
WEB_HOST=${WEB_HOST:-127.0.0.1}
WEB_PORT=${WEB_PORT:-5173}
VITE_INDEXER_BASE_URL=${VITE_INDEXER_BASE_URL:-http://$INDEXER_HOST:$INDEXER_PORT}
VITE_SPAWN_CHAIN_NAME=${VITE_SPAWN_CHAIN_NAME:-}
VITE_SPAWN_CHAIN_RPC_URL=${VITE_SPAWN_CHAIN_RPC_URL:-}
VITE_SPAWN_USDC_CONTRACT_ADDRESS=${VITE_SPAWN_USDC_CONTRACT_ADDRESS:-}

if [ -f "$DEPLOYMENT_FILE" ]; then
  deployment_values=$(sh "$ROOT_DIR/scripts/with-repo-node.sh" node -e '
    const fs = require("node:fs");
    const path = process.argv[1];
    const deployment = JSON.parse(fs.readFileSync(path, "utf8"));
    process.stdout.write(`${deployment.rpcUrl ?? ""}\n${deployment.usdcTokenAddress ?? ""}\n`);
  ' "$DEPLOYMENT_FILE")
  deployment_rpc_url=$(printf '%s\n' "$deployment_values" | sed -n '1p')
  deployment_usdc_address=$(printf '%s\n' "$deployment_values" | sed -n '2p')

  if [ -z "$VITE_SPAWN_CHAIN_NAME" ] && [ -n "$deployment_rpc_url" ]; then
    VITE_SPAWN_CHAIN_NAME="Base Local Fork"
  fi

  if [ -z "$VITE_SPAWN_CHAIN_RPC_URL" ] && [ -n "$deployment_rpc_url" ]; then
    VITE_SPAWN_CHAIN_RPC_URL="$deployment_rpc_url"
  fi

  if [ -z "$VITE_SPAWN_USDC_CONTRACT_ADDRESS" ] && [ -n "$deployment_usdc_address" ]; then
    VITE_SPAWN_USDC_CONTRACT_ADDRESS="$deployment_usdc_address"
  fi
fi

indexer_pid=""
web_pid=""

cleanup() {
  for pid in "$web_pid" "$indexer_pid"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

HOST="$INDEXER_HOST" PORT="$INDEXER_PORT" \
  npm run dev:indexer &
indexer_pid=$!

VITE_INDEXER_BASE_URL="$VITE_INDEXER_BASE_URL" \
  VITE_SPAWN_CHAIN_NAME="$VITE_SPAWN_CHAIN_NAME" \
  VITE_SPAWN_CHAIN_RPC_URL="$VITE_SPAWN_CHAIN_RPC_URL" \
  VITE_SPAWN_USDC_CONTRACT_ADDRESS="$VITE_SPAWN_USDC_CONTRACT_ADDRESS" \
  npm exec --workspace @ic-automaton/web vite -- --host "$WEB_HOST" --port "$WEB_PORT" &
web_pid=$!

wait "$indexer_pid" "$web_pid"
