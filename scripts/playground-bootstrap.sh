#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_DIR=${PLAYGROUND_TMP_DIR:-"$ROOT_DIR/tmp"}
STATUS_FILE=${PLAYGROUND_STATUS_FILE:-"$TMP_DIR/playground-status.json"}
SERVICE_DIR=${PLAYGROUND_SERVICE_DIR:-"$TMP_DIR/playground-services"}
PLAYGROUND_CHAIN_ID=${PLAYGROUND_CHAIN_ID:-20260326}
PLAYGROUND_ENV_LABEL=${PLAYGROUND_ENV_LABEL:-Automaton Playground}
PLAYGROUND_CHAIN_NAME=${PLAYGROUND_CHAIN_NAME:-Automaton Playground}
PLAYGROUND_RESET_CADENCE_LABEL=${PLAYGROUND_RESET_CADENCE_LABEL:-Scheduled hard resets}
PLAYGROUND_RESET_CADENCE_SECONDS=${PLAYGROUND_RESET_CADENCE_SECONDS:-86400}
PLAYGROUND_MANAGE_SERVICES=${PLAYGROUND_MANAGE_SERVICES:-1}
PLAYGROUND_ANVIL_MANAGED=${PLAYGROUND_ANVIL_MANAGED:-1}
PLAYGROUND_REQUIRE_FORK=${PLAYGROUND_REQUIRE_FORK:-1}
PLAYGROUND_INDEXER_HOST=${PLAYGROUND_INDEXER_HOST:-127.0.0.1}
PLAYGROUND_INDEXER_PORT=${PLAYGROUND_INDEXER_PORT:-3001}
PLAYGROUND_INDEXER_BASE_URL=${PLAYGROUND_INDEXER_BASE_URL:-http://$PLAYGROUND_INDEXER_HOST:$PLAYGROUND_INDEXER_PORT}
PLAYGROUND_RPC_GATEWAY_HOST=${PLAYGROUND_RPC_GATEWAY_HOST:-127.0.0.1}
PLAYGROUND_RPC_GATEWAY_PORT=${PLAYGROUND_RPC_GATEWAY_PORT:-3002}
PLAYGROUND_RPC_GATEWAY_URL=${PLAYGROUND_RPC_GATEWAY_URL:-http://$PLAYGROUND_RPC_GATEWAY_HOST:$PLAYGROUND_RPC_GATEWAY_PORT}
PLAYGROUND_PUBLIC_RPC_URL=${PLAYGROUND_PUBLIC_RPC_URL:-$PLAYGROUND_RPC_GATEWAY_URL}
PLAYGROUND_ICP_HOME=${PLAYGROUND_ICP_HOME:-"$TMP_DIR/icp-home"}
PLAYGROUND_ICP_NETWORK_NAME=${PLAYGROUND_ICP_NETWORK_NAME:-local}
PLAYGROUND_ICP_ENVIRONMENT=${PLAYGROUND_ICP_ENVIRONMENT:-local}
PLAYGROUND_LOCAL_REPLICA_HOST=${PLAYGROUND_LOCAL_REPLICA_HOST:-127.0.0.1}
PLAYGROUND_LOCAL_REPLICA_PORT=${PLAYGROUND_LOCAL_REPLICA_PORT:-8000}
PLAYGROUND_FACTORY_CANISTER=${PLAYGROUND_FACTORY_CANISTER:-factory}
LOCAL_EVM_HOST=${LOCAL_EVM_HOST:-127.0.0.1}
LOCAL_EVM_PORT=${LOCAL_EVM_PORT:-8545}
LOCAL_EVM_CHAIN_ID=${LOCAL_EVM_CHAIN_ID:-$PLAYGROUND_CHAIN_ID}
LOCAL_EVM_RPC_URL=${LOCAL_EVM_RPC_URL:-http://$LOCAL_EVM_HOST:$LOCAL_EVM_PORT}
LOCAL_EVM_LOG_PATH=${LOCAL_EVM_LOG_PATH:-"$SERVICE_DIR/anvil.log"}
LOCAL_EVM_PID_PATH=${LOCAL_EVM_PID_PATH:-"$SERVICE_DIR/anvil.pid"}
LOCAL_EVM_DEPLOYMENT_FILE=${LOCAL_EVM_DEPLOYMENT_FILE:-"$TMP_DIR/local-escrow-deployment.json"}
PLAYGROUND_FACTORY_CANISTER_ID_FILE=${PLAYGROUND_FACTORY_CANISTER_ID_FILE:-"$TMP_DIR/factory-canister-id.txt"}
INDEXER_DB_PATH=${INDEXER_DB_PATH:-"$TMP_DIR/playground-indexer.sqlite"}
PLAYGROUND_INDEXER_PID_FILE=${PLAYGROUND_INDEXER_PID_FILE:-"$SERVICE_DIR/indexer.pid"}
PLAYGROUND_INDEXER_LOG_FILE=${PLAYGROUND_INDEXER_LOG_FILE:-"$SERVICE_DIR/indexer.log"}
PLAYGROUND_RPC_GATEWAY_PID_FILE=${PLAYGROUND_RPC_GATEWAY_PID_FILE:-"$SERVICE_DIR/rpc-gateway.pid"}
PLAYGROUND_RPC_GATEWAY_LOG_FILE=${PLAYGROUND_RPC_GATEWAY_LOG_FILE:-"$SERVICE_DIR/rpc-gateway.log"}
PLAYGROUND_FAUCET_ENABLED=${PLAYGROUND_FAUCET_ENABLED:-1}
PLAYGROUND_FAUCET_ETH_AMOUNT=${PLAYGROUND_FAUCET_ETH_AMOUNT:-1}
PLAYGROUND_FAUCET_USDC_AMOUNT=${PLAYGROUND_FAUCET_USDC_AMOUNT:-250}
PLAYGROUND_FAUCET_CLAIM_WINDOW_SECONDS=${PLAYGROUND_FAUCET_CLAIM_WINDOW_SECONDS:-86400}
PLAYGROUND_FAUCET_MAX_CLAIMS_PER_WALLET=${PLAYGROUND_FAUCET_MAX_CLAIMS_PER_WALLET:-1}
PLAYGROUND_FAUCET_MAX_CLAIMS_PER_IP=${PLAYGROUND_FAUCET_MAX_CLAIMS_PER_IP:-20}
PLAYGROUND_BOOTSTRAP_SEED_WALLET=${PLAYGROUND_BOOTSTRAP_SEED_WALLET:-1}
PLAYGROUND_BOOTSTRAP_SEED_OUTPUT_FILE=${PLAYGROUND_BOOTSTRAP_SEED_OUTPUT_FILE:-"$TMP_DIR/playground-bootstrap-seed.json"}

CHILD_WASM_PATH=${CHILD_WASM_PATH:-}
CHILD_VERSION_COMMIT=${CHILD_VERSION_COMMIT:-${PLAYGROUND_ENV_VERSION:-}}

export ICP_HOME="$PLAYGROUND_ICP_HOME"
export PLAYGROUND_STATUS_FILE="$STATUS_FILE"
export LOCAL_EVM_CHAIN_ID
export LOCAL_EVM_RPC_URL
export LOCAL_EVM_DEPLOYMENT_FILE
export INDEXER_DB_PATH

mkdir -p "$TMP_DIR" "$SERVICE_DIR" "$PLAYGROUND_ICP_HOME"

run_with_repo_node() {
  sh "$ROOT_DIR/scripts/with-repo-node.sh" "$@"
}

write_status() {
  run_with_repo_node node "$ROOT_DIR/scripts/write-playground-status.mjs"
}

wait_for_http() {
  url=$1
  label=$2
  attempts=${3:-60}
  index=0

  while [ "$index" -lt "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi

    index=$((index + 1))
    sleep 1
  done

  echo "$label did not become ready at $url" >&2
  return 1
}

healthy_http() {
  url=$1
  curl -fsS "$url" >/dev/null 2>&1
}

healthy_rpc_endpoint() {
  rpc_chain_id "$1" >/dev/null 2>&1
}

stop_pid_file_process() {
  pid_file=$1
  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  pid=$(cat "$pid_file" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi

  rm -f "$pid_file"
}

rpc_chain_id() {
  run_with_repo_node node -e '
    const url = process.argv[1];
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] })
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || body.error || typeof body.result !== "string") {
          throw new Error(JSON.stringify(body));
        }
        process.stdout.write(body.result);
      })
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
  ' "$1"
}

verify_rpc_endpoint() {
  actual_hex=$(rpc_chain_id "$1")
  expected_hex=$(printf '0x%x' "$PLAYGROUND_CHAIN_ID")

  if [ "$actual_hex" != "$expected_hex" ]; then
    echo "unexpected chain id from $1: got $actual_hex, expected $expected_hex" >&2
    return 1
  fi
}

wait_for_rpc_endpoint() {
  url=$1
  label=$2
  attempts=${3:-60}
  index=0

  while [ "$index" -lt "$attempts" ]; do
    if healthy_rpc_endpoint "$url"; then
      return 0
    fi

    index=$((index + 1))
    sleep 1
  done

  echo "$label did not become ready at $url" >&2
  return 1
}

ensure_local_network() {
  if icp --project-root-override "$ROOT_DIR" network ping "$PLAYGROUND_ICP_NETWORK_NAME" >/dev/null 2>&1; then
    return 0
  fi

  icp --project-root-override "$ROOT_DIR" network start --background "$PLAYGROUND_ICP_NETWORK_NAME"
  icp --project-root-override "$ROOT_DIR" network ping "$PLAYGROUND_ICP_NETWORK_NAME" >/dev/null
}

deploy_factory() {
  if [ -z "$CHILD_WASM_PATH" ]; then
    echo "CHILD_WASM_PATH is required for playground bootstrap" >&2
    return 1
  fi

  if [ -z "$CHILD_VERSION_COMMIT" ]; then
    echo "CHILD_VERSION_COMMIT or PLAYGROUND_ENV_VERSION is required for playground bootstrap" >&2
    return 1
  fi

  FACTORY_VERSION_COMMIT="$CHILD_VERSION_COMMIT" \
  FACTORY_CHILD_EVM_CHAIN_ID="$PLAYGROUND_CHAIN_ID" \
  FACTORY_CHILD_EVM_RPC_URL="$LOCAL_EVM_RPC_URL" \
  FACTORY_BASE_RPC_ENDPOINT="${FACTORY_BASE_RPC_ENDPOINT:-$LOCAL_EVM_RPC_URL}" \
    icp --project-root-override "$ROOT_DIR" build

  if ! icp --project-root-override "$ROOT_DIR" canister create "$PLAYGROUND_FACTORY_CANISTER" -e "$PLAYGROUND_ICP_ENVIRONMENT" >/dev/null 2>&1; then
    :
  fi

  init_args=$(
    FACTORY_VERSION_COMMIT="$CHILD_VERSION_COMMIT" \
    FACTORY_CHILD_EVM_CHAIN_ID="$PLAYGROUND_CHAIN_ID" \
    FACTORY_CHILD_EVM_RPC_URL="$LOCAL_EVM_RPC_URL" \
    FACTORY_BASE_RPC_ENDPOINT="${FACTORY_BASE_RPC_ENDPOINT:-$LOCAL_EVM_RPC_URL}" \
    CHILD_WASM_PATH="$CHILD_WASM_PATH" \
      run_with_repo_node node "$ROOT_DIR/scripts/render-factory-local-init-args.mjs"
  )

  icp --project-root-override "$ROOT_DIR" canister install "$PLAYGROUND_FACTORY_CANISTER" -e "$PLAYGROUND_ICP_ENVIRONMENT" --mode reinstall --args "$init_args"
}

resolve_factory_canister_id() {
  status_output=$(icp --project-root-override "$ROOT_DIR" canister status "$PLAYGROUND_FACTORY_CANISTER" -e "$PLAYGROUND_ICP_ENVIRONMENT")
  printf '%s\n' "$status_output" | run_with_repo_node node -e '
    const input = require("node:fs").readFileSync(0, "utf8");
    const match =
      input.match(/Canister id:\s*([a-z2-7-]+)/i) ??
      input.match(/\bid:\s*([a-z2-7-]+)/i);
    if (!match) {
      process.exit(1);
    }
    process.stdout.write(match[1]);
  '
}

ensure_anvil() {
  if [ "$PLAYGROUND_REQUIRE_FORK" = "1" ] && [ -z "${LOCAL_EVM_FORK_URL:-}" ]; then
    echo "LOCAL_EVM_FORK_URL is required when PLAYGROUND_REQUIRE_FORK=1" >&2
    return 1
  fi

  if healthy_rpc_endpoint "$LOCAL_EVM_RPC_URL"; then
    verify_rpc_endpoint "$LOCAL_EVM_RPC_URL"
    return 0
  fi

  if [ "$PLAYGROUND_ANVIL_MANAGED" != "1" ]; then
    echo "Anvil is not healthy at $LOCAL_EVM_RPC_URL and PLAYGROUND_ANVIL_MANAGED=0" >&2
    return 1
  fi

  LOCAL_EVM_HOST="$LOCAL_EVM_HOST" \
  LOCAL_EVM_PORT="$LOCAL_EVM_PORT" \
  LOCAL_EVM_CHAIN_ID="$LOCAL_EVM_CHAIN_ID" \
  LOCAL_EVM_LOG_PATH="$LOCAL_EVM_LOG_PATH" \
  LOCAL_EVM_PID_PATH="$LOCAL_EVM_PID_PATH" \
  LOCAL_EVM_FORK_URL="${LOCAL_EVM_FORK_URL:-}" \
  LOCAL_EVM_FORK_BLOCK_NUMBER="${LOCAL_EVM_FORK_BLOCK_NUMBER:-}" \
    sh "$ROOT_DIR/scripts/start-local-evm.sh" --background

  wait_for_rpc_endpoint "$LOCAL_EVM_RPC_URL" "anvil rpc"
  verify_rpc_endpoint "$LOCAL_EVM_RPC_URL"
}

deploy_escrow() {
  LOCAL_EVM_RPC_URL="$LOCAL_EVM_RPC_URL" \
  LOCAL_EVM_CHAIN_ID="$LOCAL_EVM_CHAIN_ID" \
  LOCAL_EVM_EXPECT_CHAIN_ID="$PLAYGROUND_CHAIN_ID" \
  LOCAL_EVM_MODE="${LOCAL_EVM_MODE:-base-fork}" \
  LOCAL_EVM_DEPLOYMENT_FILE="$LOCAL_EVM_DEPLOYMENT_FILE" \
    run_with_repo_node node "$ROOT_DIR/scripts/deploy-local-escrow.mjs"
}

upload_child_artifact() {
  CHILD_WASM_PATH="$CHILD_WASM_PATH" \
  CHILD_VERSION_COMMIT="$CHILD_VERSION_COMMIT" \
  FACTORY_ENVIRONMENT="$PLAYGROUND_ICP_ENVIRONMENT" \
  FACTORY_CANISTER="$PLAYGROUND_FACTORY_CANISTER" \
    run_with_repo_node node "$ROOT_DIR/scripts/upload-factory-artifact.mjs"
}

seed_bootstrap_wallet() {
  if [ "$PLAYGROUND_BOOTSTRAP_SEED_WALLET" != "1" ]; then
    return 0
  fi

  LOCAL_EVM_DEPLOYMENT_FILE="$LOCAL_EVM_DEPLOYMENT_FILE" \
  LOCAL_EVM_SEED_OUTPUT_FILE="$PLAYGROUND_BOOTSTRAP_SEED_OUTPUT_FILE" \
  FACTORY_ENVIRONMENT="$PLAYGROUND_ICP_ENVIRONMENT" \
  FACTORY_CANISTER="$PLAYGROUND_FACTORY_CANISTER" \
    run_with_repo_node node "$ROOT_DIR/scripts/seed-local-wallet.mjs"
}

start_indexer() {
  if healthy_http "$PLAYGROUND_INDEXER_BASE_URL/health" && [ ! -f "$PLAYGROUND_INDEXER_PID_FILE" ]; then
    return 0
  fi

  stop_pid_file_process "$PLAYGROUND_INDEXER_PID_FILE"

  INDEXER_FACTORY_CANISTER_ID=$1 \
  HOST="$PLAYGROUND_INDEXER_HOST" \
  PORT="$PLAYGROUND_INDEXER_PORT" \
  INDEXER_DB_PATH="$INDEXER_DB_PATH" \
  INDEXER_INGESTION_NETWORK_TARGET="local" \
  INDEXER_INGESTION_LOCAL_HOST="$PLAYGROUND_LOCAL_REPLICA_HOST" \
  INDEXER_INGESTION_LOCAL_PORT="$PLAYGROUND_LOCAL_REPLICA_PORT" \
  PLAYGROUND_STATUS_FILE="$STATUS_FILE" \
  PLAYGROUND_ENV_LABEL="$PLAYGROUND_ENV_LABEL" \
  PLAYGROUND_ENV_VERSION="$CHILD_VERSION_COMMIT" \
  PLAYGROUND_CHAIN_ID="$PLAYGROUND_CHAIN_ID" \
  PLAYGROUND_CHAIN_NAME="$PLAYGROUND_CHAIN_NAME" \
  PLAYGROUND_PUBLIC_RPC_URL="$PLAYGROUND_PUBLIC_RPC_URL" \
  PLAYGROUND_FAUCET_ENABLED="$PLAYGROUND_FAUCET_ENABLED" \
  PLAYGROUND_FAUCET_ETH_AMOUNT="$PLAYGROUND_FAUCET_ETH_AMOUNT" \
  PLAYGROUND_FAUCET_USDC_AMOUNT="$PLAYGROUND_FAUCET_USDC_AMOUNT" \
  PLAYGROUND_FAUCET_CLAIM_WINDOW_SECONDS="$PLAYGROUND_FAUCET_CLAIM_WINDOW_SECONDS" \
  PLAYGROUND_FAUCET_MAX_CLAIMS_PER_WALLET="$PLAYGROUND_FAUCET_MAX_CLAIMS_PER_WALLET" \
  PLAYGROUND_FAUCET_MAX_CLAIMS_PER_IP="$PLAYGROUND_FAUCET_MAX_CLAIMS_PER_IP" \
  PLAYGROUND_RESET_CADENCE_LABEL="$PLAYGROUND_RESET_CADENCE_LABEL" \
  LOCAL_EVM_RPC_URL="$LOCAL_EVM_RPC_URL" \
    nohup sh "$ROOT_DIR/scripts/with-repo-node.sh" node --import tsx "$ROOT_DIR/apps/indexer/src/server.ts" >"$PLAYGROUND_INDEXER_LOG_FILE" 2>&1 &

  echo "$!" >"$PLAYGROUND_INDEXER_PID_FILE"
  wait_for_http "$PLAYGROUND_INDEXER_BASE_URL/health" "indexer"
}

start_rpc_gateway() {
  if healthy_http "$PLAYGROUND_RPC_GATEWAY_URL/health" && [ ! -f "$PLAYGROUND_RPC_GATEWAY_PID_FILE" ]; then
    verify_rpc_endpoint "$PLAYGROUND_RPC_GATEWAY_URL"
    return 0
  fi

  stop_pid_file_process "$PLAYGROUND_RPC_GATEWAY_PID_FILE"

  RPC_GATEWAY_HOST="$PLAYGROUND_RPC_GATEWAY_HOST" \
  RPC_GATEWAY_PORT="$PLAYGROUND_RPC_GATEWAY_PORT" \
  RPC_GATEWAY_UPSTREAM_URL="$LOCAL_EVM_RPC_URL" \
  PLAYGROUND_CHAIN_ID="$PLAYGROUND_CHAIN_ID" \
    nohup sh "$ROOT_DIR/scripts/with-repo-node.sh" node --import tsx "$ROOT_DIR/apps/rpc-gateway/src/server.ts" >"$PLAYGROUND_RPC_GATEWAY_LOG_FILE" 2>&1 &

  echo "$!" >"$PLAYGROUND_RPC_GATEWAY_PID_FILE"
  wait_for_http "$PLAYGROUND_RPC_GATEWAY_URL/health" "rpc gateway"
  verify_rpc_endpoint "$PLAYGROUND_RPC_GATEWAY_URL"
}

ensure_services() {
  factory_canister_id=$1

  if [ "$PLAYGROUND_MANAGE_SERVICES" = "1" ]; then
    start_rpc_gateway
    start_indexer "$factory_canister_id"
    return 0
  fi

  wait_for_http "$PLAYGROUND_RPC_GATEWAY_URL/health" "rpc gateway"
  wait_for_http "$PLAYGROUND_INDEXER_BASE_URL/health" "indexer"
  verify_rpc_endpoint "$PLAYGROUND_RPC_GATEWAY_URL"
}

PLAYGROUND_STATUS_ENVIRONMENT_VERSION="$CHILD_VERSION_COMMIT" \
PLAYGROUND_STATUS_MAINTENANCE="true" \
PLAYGROUND_STATUS_UPDATED_AT="now" \
  write_status >/dev/null

ensure_local_network
ensure_anvil
deploy_escrow
deploy_factory
upload_child_artifact
seed_bootstrap_wallet

factory_canister_id=$(resolve_factory_canister_id)
mkdir -p "$(dirname "$PLAYGROUND_FACTORY_CANISTER_ID_FILE")"
printf '%s\n' "$factory_canister_id" >"$PLAYGROUND_FACTORY_CANISTER_ID_FILE"
ensure_services "$factory_canister_id"

sh "$ROOT_DIR/scripts/playground-smoke.sh"

PLAYGROUND_STATUS_ENVIRONMENT_VERSION="$CHILD_VERSION_COMMIT" \
PLAYGROUND_STATUS_MAINTENANCE="false" \
PLAYGROUND_STATUS_LAST_RESET_AT="now" \
PLAYGROUND_STATUS_NEXT_RESET_AT="+$PLAYGROUND_RESET_CADENCE_SECONDS" \
PLAYGROUND_STATUS_UPDATED_AT="now" \
  write_status >/dev/null
