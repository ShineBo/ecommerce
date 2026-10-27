#!/bin/sh
# Select a Compose configuration without changing the current Docker context.
set -eu
cd "$(dirname "$0")/.."
mode=${1:-}
if [ "$#" -lt 2 ]; then
  printf '%s\n' 'Usage: sh scripts/shop.sh dev|local|vm|test COMPOSE_COMMAND [OPTIONS]' >&2
  exit 2
fi
shift
case "$mode" in
  dev) set -- -f compose.yaml -f compose.compass.yaml -f compose.dev.yaml "$@" ;;
  local) set -- -f compose.yaml -f compose.compass.yaml "$@" ;;
  vm) set -- --env-file .env.vm -f compose.deploy.yaml "$@" ;;
  test) set -- -f compose.test.yaml "$@" ;;
  *) printf 'Unknown mode: %s\n' "$mode" >&2; exit 2 ;;
esac
exec docker compose "$@"
