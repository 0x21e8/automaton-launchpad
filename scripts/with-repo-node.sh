#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
NVMRC_PATH="$REPO_ROOT/.nvmrc"

if [ -f "$NVMRC_PATH" ]; then
  NODE_VERSION=$(tr -d '\r\n' < "$NVMRC_PATH")
  NVM_NODE_DIR="$HOME/.nvm/versions/node/v$NODE_VERSION/bin"

  if [ -x "$NVM_NODE_DIR/node" ]; then
    PATH="$NVM_NODE_DIR:$PATH"
    export PATH
  fi
fi

exec "$@"
