#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

MOCK_BIN="$TEST_ROOT/bin"
DATA_DIR="$TEST_ROOT/data"
ENV_FILE="$TEST_ROOT/.env.production"
mkdir -p "$MOCK_BIN" "$DATA_DIR"

cat >"$MOCK_BIN/supabase" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "db" && "${2:-}" == "dump" ]]; then
  output=""
  data_only=false
  while (($#)); do
    if [[ "$1" == "--file" ]]; then output="$2"; shift 2; continue; fi
    if [[ "$1" == "--data-only" ]]; then data_only=true; fi
    shift
  done
  if [[ "${MOCK_SCHEMA_HAS_WORLDS:-false}" == "true" && "$data_only" == "false" ]]; then
    printf '%s\n' 'CREATE TABLE public.worlds (' >"$output"
  else
    printf '%s\n' '-- empty production public schema' >"$output"
  fi
  exit 0
fi
if [[ "${1:-}" == "migration" && "${2:-}" == "list" ]]; then
  printf '%s\n' 'Local | Remote | Time'
  exit 0
fi
exit 64
MOCK

cat >"$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
output=""
while (($#)); do
  if [[ "$1" == "--output" ]]; then output="$2"; shift 2; continue; fi
  if [[ "$1" == "--write-out" ]]; then shift 2; continue; fi
  shift
done
status="${MOCK_CURL_STATUS:-404}"
body='{"code":"TEST_RESPONSE"}'
if [[ -n "$output" ]]; then
  printf '%s\n' "$body" >"$output"
  printf '%s' "$status"
  exit 0
fi
printf '%s\n' "$body"
exit 22
MOCK

cat >"$MOCK_BIN/docker" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

cat >"$MOCK_BIN/vercel" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' '{"status":"unavailable"}'
MOCK

chmod +x "$MOCK_BIN/supabase" "$MOCK_BIN/curl" "$MOCK_BIN/docker" "$MOCK_BIN/vercel"

write_env() {
  local env_file=$1
  local data_dir=$2
  mkdir -p "$data_dir"
  cat >"$env_file" <<EOF
PALHATCH_DATA_DIR=$data_dir
SUPABASE_PROJECT_REF=test-project
SUPABASE_URL=https://example.invalid
SUPABASE_SERVICE_ROLE_KEY=example-test-key
PUBLIC_APP_URL=https://example.invalid
EOF
  chmod 0600 "$env_file"
}

write_env "$ENV_FILE" "$DATA_DIR"

PATH="$MOCK_BIN:$PATH" ENV_FILE="$ENV_FILE" \
  "$REPO_ROOT/infra/agent/scripts/backup-production.sh" >/dev/null

backup_dir="$(find "$DATA_DIR/backups" -mindepth 1 -maxdepth 1 -type d -print -quit)"
test -n "$backup_dir"
test "$(stat -c '%a' "$backup_dir")" = "700"
grep -Fqx '{"status":"not_present_before_first_deploy","worlds":[]}' \
  "$backup_dir/active-catalog-versions.json"

existing_schema_env="$TEST_ROOT/existing-schema.env"
existing_schema_data="$TEST_ROOT/existing-schema-data"
write_env "$existing_schema_env" "$existing_schema_data"
set +e
MOCK_SCHEMA_HAS_WORLDS=true PATH="$MOCK_BIN:$PATH" ENV_FILE="$existing_schema_env" \
  "$REPO_ROOT/infra/agent/scripts/backup-production.sh" >/dev/null 2>&1
existing_schema_status=$?
set -e
test "$existing_schema_status" = "75"

server_error_env="$TEST_ROOT/server-error.env"
server_error_data="$TEST_ROOT/server-error-data"
write_env "$server_error_env" "$server_error_data"
set +e
MOCK_CURL_STATUS=503 PATH="$MOCK_BIN:$PATH" ENV_FILE="$server_error_env" \
  "$REPO_ROOT/infra/agent/scripts/backup-production.sh" >/dev/null 2>&1
server_error_status=$?
set -e
test "$server_error_status" = "75"

echo "Production backup empty-schema regression passed."
