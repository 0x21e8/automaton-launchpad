#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PLAYGROUND_ENV_FILE=${PLAYGROUND_ENV_FILE:-/etc/automaton-playground/playground.env}
PLAYGROUND_COMPOSE_FILE=${PLAYGROUND_COMPOSE_FILE:-"$ROOT_DIR/ops/playground/docker-compose.yml"}
MANIFEST_PATH=""
MODE_OVERRIDE=""

usage() {
  cat <<'EOF' >&2
Usage: scripts/deploy-playground-release.sh --manifest <path> [--mode soft|hard-reset]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --manifest)
      MANIFEST_PATH=${2:-}
      shift 2
      ;;
    --mode)
      MODE_OVERRIDE=${2:-}
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$MANIFEST_PATH" ]; then
  echo "--manifest is required" >&2
  usage
  exit 1
fi

if [ ! -f "$MANIFEST_PATH" ]; then
  echo "Release manifest not found: $MANIFEST_PATH" >&2
  exit 1
fi

if [ ! -f "$PLAYGROUND_ENV_FILE" ]; then
  echo "Playground env file not found: $PLAYGROUND_ENV_FILE" >&2
  exit 1
fi

if [ ! -f "$PLAYGROUND_COMPOSE_FILE" ]; then
  echo "Compose file not found: $PLAYGROUND_COMPOSE_FILE" >&2
  exit 1
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command bash
require_command curl
require_command docker
require_command node
require_command sha256sum

run_with_repo_node() {
  sh "$ROOT_DIR/scripts/with-repo-node.sh" "$@"
}

set -a
. "$PLAYGROUND_ENV_FILE"
set +a

PLAYGROUND_STATE_DIR=${PLAYGROUND_STATE_DIR:-"$ROOT_DIR/tmp"}
PLAYGROUND_RELEASES_DIR=${PLAYGROUND_RELEASES_DIR:-"$PLAYGROUND_STATE_DIR/releases"}
PLAYGROUND_ARTIFACTS_DIR=${PLAYGROUND_ARTIFACTS_DIR:-"$PLAYGROUND_STATE_DIR/artifacts"}
PLAYGROUND_INDEXER_BASE_URL=${PLAYGROUND_INDEXER_BASE_URL:-http://127.0.0.1:${PLAYGROUND_INDEXER_PORT:-3001}}
PLAYGROUND_RPC_GATEWAY_URL=${PLAYGROUND_RPC_GATEWAY_URL:-http://127.0.0.1:${PLAYGROUND_RPC_GATEWAY_PORT:-3002}}

mkdir -p "$PLAYGROUND_RELEASES_DIR" "$PLAYGROUND_ARTIFACTS_DIR"

manifest_env_file=$(mktemp)
artifact_download_tmp=""
cleanup() {
  rm -f "$manifest_env_file"
  if [ -n "$artifact_download_tmp" ]; then
    rm -f "$artifact_download_tmp"
  fi
}
trap cleanup EXIT

run_with_repo_node node --input-type=module - "$MANIFEST_PATH" "$MODE_OVERRIDE" >"$manifest_env_file" <<'NODE'
import fs from "node:fs";
import path from "node:path";

const [manifestPath, modeOverride] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function printAssignment(key, value) {
  console.log(`${key}=${shellQuote(value ?? "")}`);
}

function requireObject(value, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label, options = {}) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (options.pattern && !options.pattern.test(normalized)) {
    fail(`${label} is invalid: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).trim();
}

function optionalIntegerString(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return "";
  }
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    fail(`${label} must be an integer string or number`);
  }
  return normalized;
}

const release = requireObject(manifest.release, "release");
const images = requireObject(manifest.images, "images");
const childArtifact = requireObject(manifest.childArtifact, "childArtifact");
const fork = requireObject(manifest.fork, "fork");

const mode = (modeOverride || release.mode || "").trim();
if (!["soft", "hard-reset"].includes(mode)) {
  fail(`release.mode must be "soft" or "hard-reset"; received ${JSON.stringify(mode || release.mode)}`);
}

const gitCommit = requireString(release.gitCommit, "release.gitCommit", {
  pattern: /^[0-9a-f]{40}$/
});
const environmentVersion = requireString(
  release.environmentVersion ?? gitCommit,
  "release.environmentVersion"
);

function validateImage(name) {
  const image = requireObject(images[name], `images.${name}`);
  const repository = requireString(image.repository, `images.${name}.repository`);
  const tag = requireString(image.tag, `images.${name}.tag`);
  const digest = requireString(image.digest, `images.${name}.digest`, {
    pattern: /^sha256:[a-f0-9]{64}$/
  });
  const ref = requireString(image.ref, `images.${name}.ref`);
  const expectedRef = `${repository}@${digest}`;
  if (ref !== expectedRef) {
    fail(`images.${name}.ref must match ${JSON.stringify(expectedRef)}`);
  }
  return {
    repository,
    tag,
    digest,
    ref
  };
}

const webImage = validateImage("web");
const indexerImage = validateImage("indexer");
const rpcGatewayImage = validateImage("rpcGateway");

const childVersionCommit = requireString(childArtifact.versionCommit, "childArtifact.versionCommit", {
  pattern: /^[0-9a-f]{40}$/
});
const childSha256 = requireString(childArtifact.sha256, "childArtifact.sha256", {
  pattern: /^[a-f0-9]{64}$/
});
const childUrl = optionalString(childArtifact.url);
const childPath = optionalString(childArtifact.path);
const childFileName =
  optionalString(childArtifact.fileName) ||
  (childUrl !== "" ? path.basename(new URL(childUrl).pathname) : "") ||
  (childPath !== "" ? path.basename(childPath) : "");

if (childUrl === "" && childPath === "") {
  fail("childArtifact.url or childArtifact.path must be set");
}

const chainId = Number.parseInt(
  requireString(String(fork.chainId ?? ""), "fork.chainId", { pattern: /^\d+$/ }),
  10
);
const forkBlockNumber = optionalIntegerString(fork.blockNumber, "fork.blockNumber");

printAssignment("RELEASE_MODE", mode);
printAssignment("RELEASE_GIT_COMMIT", gitCommit);
printAssignment("PLAYGROUND_ENV_VERSION", environmentVersion);
printAssignment("PLAYGROUND_CHAIN_ID", String(chainId));
printAssignment("PLAYGROUND_WEB_IMAGE", webImage.ref);
printAssignment("PLAYGROUND_INDEXER_IMAGE", indexerImage.ref);
printAssignment("PLAYGROUND_RPC_GATEWAY_IMAGE", rpcGatewayImage.ref);
printAssignment("CHILD_VERSION_COMMIT", childVersionCommit);
printAssignment("CHILD_ARTIFACT_SHA256", childSha256);
printAssignment("CHILD_ARTIFACT_URL", childUrl);
printAssignment("CHILD_ARTIFACT_FILE_NAME", childFileName);
printAssignment("CHILD_ARTIFACT_PATH", childPath);
printAssignment("LOCAL_EVM_FORK_BLOCK_NUMBER", forkBlockNumber);
NODE

set -a
. "$manifest_env_file"
set +a

if [ -z "${CHILD_ARTIFACT_FILE_NAME:-}" ]; then
  CHILD_ARTIFACT_FILE_NAME="child-${CHILD_VERSION_COMMIT}.wasm.gz"
fi

if [ -z "${CHILD_WASM_PATH:-}" ]; then
  CHILD_WASM_PATH="$PLAYGROUND_ARTIFACTS_DIR/$CHILD_ARTIFACT_FILE_NAME"
fi
export CHILD_WASM_PATH

if [ -n "${CHILD_ARTIFACT_URL:-}" ]; then
  artifact_download_tmp="${CHILD_WASM_PATH}.download"
  curl -LfsS "$CHILD_ARTIFACT_URL" -o "$artifact_download_tmp"
  printf '%s  %s\n' "$CHILD_ARTIFACT_SHA256" "$artifact_download_tmp" | sha256sum -c >/dev/null
  mv "$artifact_download_tmp" "$CHILD_WASM_PATH"
  artifact_download_tmp=""
elif [ -n "${CHILD_ARTIFACT_PATH:-}" ]; then
  CHILD_WASM_PATH="$CHILD_ARTIFACT_PATH"
  export CHILD_WASM_PATH
fi

if [ ! -f "$CHILD_WASM_PATH" ]; then
  echo "Child artifact file not found: $CHILD_WASM_PATH" >&2
  exit 1
fi

printf '%s  %s\n' "$CHILD_ARTIFACT_SHA256" "$CHILD_WASM_PATH" | sha256sum -c >/dev/null

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

compose() {
  docker compose -f "$PLAYGROUND_COMPOSE_FILE" "$@"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local index=0

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

wait_for_rpc() {
  local url="$1"
  local label="$2"
  local attempts="${3:-60}"
  local index=0

  while [ "$index" -lt "$attempts" ]; do
    if rpc_chain_id "$url" >/dev/null 2>&1; then
      return 0
    fi

    index=$((index + 1))
    sleep 1
  done

  echo "$label did not become ready at $url" >&2
  return 1
}

write_status() {
  run_with_repo_node node "$ROOT_DIR/scripts/write-playground-status.mjs"
}

pull_release_images() {
  docker pull "$PLAYGROUND_WEB_IMAGE"
  docker pull "$PLAYGROUND_INDEXER_IMAGE"
  docker pull "$PLAYGROUND_RPC_GATEWAY_IMAGE"

  if [ "$RELEASE_MODE" = "hard-reset" ] && [ -n "${PLAYGROUND_ANVIL_IMAGE:-}" ]; then
    docker pull "$PLAYGROUND_ANVIL_IMAGE"
  fi
}

update_runtime_services() {
  compose up -d --force-recreate web rpc-gateway indexer
}

record_release_manifest() {
  local timestamp
  timestamp=$(date -u +"%Y%m%dT%H%M%SZ")
  local target_path="$PLAYGROUND_RELEASES_DIR/${timestamp}-${RELEASE_GIT_COMMIT}-${RELEASE_MODE}.json"
  cp "$MANIFEST_PATH" "$target_path"
  cp "$MANIFEST_PATH" "$PLAYGROUND_RELEASES_DIR/current.json"
}

run_soft_deploy() {
  update_runtime_services
  wait_for_http "$PLAYGROUND_INDEXER_BASE_URL/health" "indexer"
  wait_for_http "$PLAYGROUND_RPC_GATEWAY_URL/health" "rpc gateway"
  wait_for_rpc "$PLAYGROUND_RPC_GATEWAY_URL" "rpc gateway"
  sh "$ROOT_DIR/scripts/playground-smoke.sh"
  PLAYGROUND_STATUS_ENVIRONMENT_VERSION="$PLAYGROUND_ENV_VERSION" \
  PLAYGROUND_STATUS_MAINTENANCE="false" \
  PLAYGROUND_STATUS_UPDATED_AT="now" \
    write_status >/dev/null
}

run_hard_reset_deploy() {
  update_runtime_services

  PLAYGROUND_ANVIL_RESET_COMMAND="docker compose -f '$PLAYGROUND_COMPOSE_FILE' up -d --force-recreate --no-deps anvil" \
    sh "$ROOT_DIR/scripts/playground-reset.sh"
}

pull_release_images

case "$RELEASE_MODE" in
  soft)
    run_soft_deploy
    ;;
  hard-reset)
    run_hard_reset_deploy
    ;;
  *)
    echo "Unsupported release mode: $RELEASE_MODE" >&2
    exit 1
    ;;
esac

record_release_manifest

printf '%s\n' "Deployed $RELEASE_MODE release $RELEASE_GIT_COMMIT"
