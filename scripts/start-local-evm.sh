#!/bin/sh

set -eu

RPC_HOST="${LOCAL_EVM_HOST:-127.0.0.1}"
RPC_PORT="${LOCAL_EVM_PORT:-8545}"
CHAIN_ID="${LOCAL_EVM_CHAIN_ID:-8453}"
MNEMONIC="${LOCAL_EVM_MNEMONIC:-test test test test test test test test test test test junk}"
BACKGROUND=0
LOG_PATH="${LOCAL_EVM_LOG_PATH:-/tmp/automaton-launchpad-anvil.log}"
PID_PATH="${LOCAL_EVM_PID_PATH:-/tmp/automaton-launchpad-anvil.pid}"

if [ "${1:-}" = "--background" ]; then
  BACKGROUND=1
fi

if [ "$BACKGROUND" -eq 1 ]; then
  nohup anvil \
    --host "$RPC_HOST" \
    --port "$RPC_PORT" \
    --chain-id "$CHAIN_ID" \
    --mnemonic "$MNEMONIC" \
    >"$LOG_PATH" 2>&1 &
  echo "$!" >"$PID_PATH"
  echo "anvil started"
  echo "rpc_url=http://$RPC_HOST:$RPC_PORT"
  echo "chain_id=$CHAIN_ID"
  echo "pid=$(cat "$PID_PATH")"
  echo "log_path=$LOG_PATH"
  exit 0
fi

exec anvil \
  --host "$RPC_HOST" \
  --port "$RPC_PORT" \
  --chain-id "$CHAIN_ID" \
  --mnemonic "$MNEMONIC"
