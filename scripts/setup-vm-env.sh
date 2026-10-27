#!/bin/sh
# Run on the VM. Generates fresh credentials without requiring Node.js on the host.
set -eu
cd "$(dirname "$0")/.."
if [ -s .env.vm ]; then
  printf '%s\n' 'Existing .env.vm preserved. No credentials changed.'
  exit 0
fi
origin=${1:-http://localhost:8088}
# One explicit browser origin. Keep dotenv/sed metacharacters out of this value.
if ! printf '%s\n' "$origin" | LC_ALL=C grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
  printf '%s\n' 'Use a browser origin such as http://localhost:8088 or http://192.168.1.50 (no trailing slash).' >&2
  exit 1
fi
command -v openssl >/dev/null 2>&1 || { printf '%s\n' 'Install openssl first: sudo apt install openssl' >&2; exit 1; }
umask 077
temporary=$(mktemp .env.vm.tmp.XXXXXX)
trap 'rm -f "$temporary"' EXIT HUP INT TERM
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    APP_ORIGIN=*) printf 'APP_ORIGIN=%s\n' "$origin" ;;
    *=GENERATE_WITH_VM_SETUP_SCRIPT) printf '%s=%s\n' "${line%%=*}" "$(openssl rand -hex 32)" ;;
    *) printf '%s\n' "$line" ;;
  esac
done < .env.vm.example > "$temporary"
# Hard link fails if another process already created the configuration.
ln "$temporary" .env.vm
printf '%s\n' 'Generated .env.vm with fresh credentials. Passwords were not printed.'
printf 'Browser origin: %s\n' "$origin"
