#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ "${1:-list}" = inspect ]; then
  [ "$#" -eq 2 ] || { echo 'Usage: ./scripts/orders.sh inspect ORDER_REFERENCE' >&2; exit 1; }
  docker compose exec -T backend node scripts/orders.js inspect "$2"
  shop_slip_dir=$(mktemp -d "${TMPDIR:-/tmp}/simple-shop-slip.XXXXXX")
  chmod 700 "$shop_slip_dir"
  # A .jpg suffix works for either decoded image in common image viewers, but detect the actual type.
  docker compose exec -T backend node scripts/orders.js export-slip "$2" > "$shop_slip_dir/slip"
  chmod 600 "$shop_slip_dir/slip"
  shop_slip_type=$(file --brief --mime-type "$shop_slip_dir/slip")
  case "$shop_slip_type" in image/png) shop_slip_ext=png ;; *) shop_slip_ext=jpg ;; esac
  mv "$shop_slip_dir/slip" "$shop_slip_dir/slip.$shop_slip_ext"
  printf '\nPrivate slip exported to: %s\n' "$shop_slip_dir/slip.$shop_slip_ext"
  printf 'Open this file in your image viewer; delete this temporary directory when finished.\n'
else
  docker compose exec -T backend node scripts/orders.js "$@"
fi
