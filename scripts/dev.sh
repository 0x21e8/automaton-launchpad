#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

INDEXER_HOST=${INDEXER_HOST:-127.0.0.1}
INDEXER_PORT=${INDEXER_PORT:-3001}
WEB_HOST=${WEB_HOST:-127.0.0.1}
WEB_PORT=${WEB_PORT:-5173}
VITE_INDEXER_BASE_URL=${VITE_INDEXER_BASE_URL:-http://$INDEXER_HOST:$INDEXER_PORT}

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
  npm exec --workspace @ic-automaton/web vite -- --host "$WEB_HOST" --port "$WEB_PORT" &
web_pid=$!

wait "$indexer_pid" "$web_pid"
