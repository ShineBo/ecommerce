#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mode=local
if [ "${1:-}" = --mode ]; then
  [ "$#" -ge 3 ] || { printf '%s\n' 'Usage: sh scripts/orders.sh [--mode dev|local|vm] COMMAND [OPTIONS]' >&2; exit 2; }
  mode=$2
  shift 2
fi
case "$mode" in dev|local|vm) ;; *) printf 'Unknown mode: %s\n' "$mode" >&2; exit 2 ;; esac
compose() { sh scripts/shop.sh "$mode" "$@"; }
if [ "${1:-list}" = inspect ]; then
  [ "$#" -eq 2 ] || { echo 'Usage: ./scripts/orders.sh inspect ORDER_REFERENCE' >&2; exit 1; }
  compose exec -T backend node scripts/orders.js inspect "$2"
  shop_slip_dir=$(mktemp -d "${TMPDIR:-/tmp}/simple-shop-slip.XXXXXX")
  chmod 700 "$shop_slip_dir"
  # A .jpg suffix works for either decoded image in common image viewers, but detect the actual type.
  compose exec -T backend node scripts/orders.js export-slip "$2" > "$shop_slip_dir/slip"
  chmod 600 "$shop_slip_dir/slip"
  shop_slip_type=$(file --brief --mime-type "$shop_slip_dir/slip")
  case "$shop_slip_type" in image/png) shop_slip_ext=png ;; *) shop_slip_ext=jpg ;; esac
  mv "$shop_slip_dir/slip" "$shop_slip_dir/slip.$shop_slip_ext"
  printf '\nPrivate slip exported to: %s\n' "$shop_slip_dir/slip.$shop_slip_ext"
  printf 'Open this file in your image viewer; delete this temporary directory when finished.\n'
else
  compose exec -T backend node scripts/orders.js "$@"
fi
