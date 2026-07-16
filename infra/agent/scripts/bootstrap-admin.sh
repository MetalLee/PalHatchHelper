#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/infra/agent/.env.production}"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=true; shift; fi
if [[ $# -ne 0 ]]; then echo "usage: $0 [--dry-run]" >&2; exit 64; fi
if [[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" != "$REPO_ROOT" ]]; then echo "BOOTSTRAP_WORKDIR_INVALID" >&2; exit 65; fi
if [[ ! -f "$ENV_FILE" || "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then echo "PRODUCTION_ENV_INVALID" >&2; exit 66; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${BOOTSTRAP_ADMIN_EMAIL:?BOOTSTRAP_ADMIN_EMAIL is required}"
if $DRY_RUN; then echo "DRY_RUN: invoke the idempotent first-admin RPC for the environment-provided account"; exit 0; fi

payload="$(python3 -c 'import json, os; print(json.dumps({"p_email": os.environ["BOOTSTRAP_ADMIN_EMAIL"]}))')"
response_file="$(mktemp)"
trap 'rm -f "$response_file"' EXIT
status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' --max-time 15 \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  --data "$payload" \
  "$SUPABASE_URL/rest/v1/rpc/bootstrap_first_admin")"
if [[ "$status" != "200" ]]; then echo "BOOTSTRAP_ADMIN_FAILED" >&2; exit 76; fi
python3 - "$response_file" <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1], encoding="utf-8"))
if payload.get("role") != "admin" or not payload.get("user_id"):
    raise SystemExit("BOOTSTRAP_ADMIN_RESPONSE_INVALID")
PY
echo "BOOTSTRAP_ADMIN_COMPLETED"
