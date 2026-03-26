#!/bin/sh

set -eu

RPC_HOST="${LOCAL_EVM_HOST:-127.0.0.1}"
RPC_PORT="${LOCAL_EVM_PORT:-8545}"
CHAIN_ID="${LOCAL_EVM_CHAIN_ID:-8453}"
MNEMONIC="${LOCAL_EVM_MNEMONIC:-test test test test test test test test test test test junk}"
BACKGROUND=0
LOG_PATH="${LOCAL_EVM_LOG_PATH:-/tmp/automaton-launchpad-anvil.log}"
PID_PATH="${LOCAL_EVM_PID_PATH:-/tmp/automaton-launchpad-anvil.pid}"
FORK_URL="${LOCAL_EVM_FORK_URL:-}"
FORK_BLOCK_NUMBER="${LOCAL_EVM_FORK_BLOCK_NUMBER:-}"
CLI_MODE="${1:-}"

mkdir -p "$(dirname "$LOG_PATH")" "$(dirname "$PID_PATH")"

set -- \
  --host "$RPC_HOST" \
  --port "$RPC_PORT" \
  --chain-id "$CHAIN_ID" \
  --mnemonic "$MNEMONIC"

if [ -n "$FORK_URL" ]; then
  set -- "$@" --fork-url "$FORK_URL"

  if [ -n "$FORK_BLOCK_NUMBER" ]; then
    set -- "$@" --fork-block-number "$FORK_BLOCK_NUMBER"
  fi
fi

if [ "$CLI_MODE" = "--background" ]; then
  BACKGROUND=1
fi

if [ "$BACKGROUND" -eq 1 ]; then
  nohup anvil "$@" >"$LOG_PATH" 2>&1 &
  echo "$!" >"$PID_PATH"
  echo "anvil started"
  echo "rpc_url=http://$RPC_HOST:$RPC_PORT"
  echo "chain_id=$CHAIN_ID"
  echo "fork_enabled=$( [ -n "$FORK_URL" ] && echo true || echo false )"
  if [ -n "$FORK_BLOCK_NUMBER" ]; then
    echo "fork_block_number=$FORK_BLOCK_NUMBER"
  fi
  echo "pid=$(cat "$PID_PATH")"
  echo "log_path=$LOG_PATH"
  exit 0
fi

exec anvil "$@"
