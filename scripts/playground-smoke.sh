#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PLAYGROUND_ICP_HOME=${PLAYGROUND_ICP_HOME:-"$ROOT_DIR/tmp/icp-home"}
PLAYGROUND_ICP_NETWORK_NAME=${PLAYGROUND_ICP_NETWORK_NAME:-local}

export ICP_HOME="$PLAYGROUND_ICP_HOME"

icp --project-root-override "$ROOT_DIR" network ping "$PLAYGROUND_ICP_NETWORK_NAME" >/dev/null

exec sh "$ROOT_DIR/scripts/with-repo-node.sh" node "$ROOT_DIR/scripts/playground-smoke.mjs"
