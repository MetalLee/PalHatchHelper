#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/agent/docker-compose.production.yml"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/infra/agent/.env.production}"
PROJECT_NAME="palhatchhelper-agent"
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=true; shift; fi
if [[ $# -ne 0 ]]; then echo "usage: $0 [--dry-run]" >&2; exit 64; fi
if [[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" != "$REPO_ROOT" ]]; then echo "BACKUP_WORKDIR_INVALID" >&2; exit 65; fi
if [[ ! -f "$ENV_FILE" || "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then echo "PRODUCTION_ENV_INVALID" >&2; exit 66; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${PALHATCH_DATA_DIR:?PALHATCH_DATA_DIR is required}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="$PALHATCH_DATA_DIR/backups/$timestamp"
if $DRY_RUN; then echo "DRY_RUN: create permission-0700 production backup with schema, public data, migrations, catalog pointer, Agent image/Compose/env metadata, Git and Vercel reference"; exit 0; fi

umask 077
install -d -m 0700 "$backup_dir"
failure() { echo "PRODUCTION_BACKUP_FAILED" >&2; exit 75; }
trap failure ERR

supabase db dump --linked --schema public --file "$backup_dir/supabase-schema.sql" >/dev/null
supabase db dump --linked --data-only --schema public --file "$backup_dir/supabase-public-data.sql" >/dev/null
supabase migration list --linked >"$backup_dir/supabase-migrations.txt"
curl --fail --silent --show-error --max-time 15 \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$SUPABASE_URL/rest/v1/worlds?select=id,active_game_data_version_id" \
  >"$backup_dir/active-catalog-versions.json"

compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
api_id="$("${compose[@]}" ps -q api 2>/dev/null || true)"
if [[ -n "$api_id" ]]; then docker inspect --format '{{.Config.Image}}' "$api_id" >"$backup_dir/agent-image.txt"; else printf '%s\n' "not_running" >"$backup_dir/agent-image.txt"; fi
cp --preserve=mode,timestamps "$COMPOSE_FILE" "$backup_dir/docker-compose.production.yml"
install -m 0600 "$ENV_FILE" "$backup_dir/env.production"
git -C "$REPO_ROOT" rev-parse HEAD >"$backup_dir/git-sha.txt"
if command -v vercel >/dev/null; then
  vercel inspect "$PUBLIC_APP_URL" --json >"$backup_dir/vercel-deployment.json" 2>/dev/null || printf '%s\n' '{"status":"unavailable"}' >"$backup_dir/vercel-deployment.json"
else
  printf '%s\n' '{"status":"cli_not_installed"}' >"$backup_dir/vercel-deployment.json"
fi
printf '%s\n' "$timestamp" >"$backup_dir/backup-id.txt"
chmod -R go-rwx "$backup_dir"
trap - ERR
echo "PRODUCTION_BACKUP_CREATED:$backup_dir"
