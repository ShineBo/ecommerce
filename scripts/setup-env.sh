#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if command -v node >/dev/null 2>&1; then
  node scripts/setup-env.mjs
else
  docker run --rm -v "$PWD:/workspace" -w /workspace node:24-bookworm-slim node scripts/setup-env.mjs
fi
