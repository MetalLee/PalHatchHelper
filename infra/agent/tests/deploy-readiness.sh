#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_ROOT="$(mktemp -d)"
MOCK_BIN="$TEST_ROOT/bin"
MOCK_STATE="$TEST_ROOT/state"
DATA_DIR="$TEST_ROOT/data"
ENV_FILE="$TEST_ROOT/.env.production"

cleanup() {
  if [[ "$EUID" -eq 0 ]]; then
    rm -rf -- "$TEST_ROOT"
    return
  fi
  sudo -n rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

run_as_root() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
    return
  fi
  sudo -n "$@"
}

mkdir -p "$MOCK_BIN" "$MOCK_STATE" "$DATA_DIR"

cat >"$MOCK_BIN/git" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case " $* " in
  *" rev-parse --show-toplevel "*) printf '%s\n' "$MOCK_REPO_ROOT" ;;
  *" rev-parse HEAD "*) printf '%s\n' 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' ;;
  *) exit 64 ;;
esac
MOCK

cat >"$MOCK_BIN/docker" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "pull" ]]; then exit 0; fi
if [[ "${1:-}" == "image" && "${2:-}" == "inspect" ]]; then
  printf '%s\n' '["test.invalid/agent:test@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]'
  exit 0
fi
if [[ "${1:-}" == "inspect" ]]; then
  format="${3:-}"
  container_id="${4:-}"
  case "$format" in
    '{{.State.Running}}') printf '%s\n' true ;;
    '{{.Config.User}}') printf '%s\n' '10001:10001' ;;
    '{{json .HostConfig.CapDrop}}') printf '%s\n' '["ALL"]' ;;
    '{{json .HostConfig.SecurityOpt}}') printf '%s\n' '["no-new-privileges:true"]' ;;
    '{{.HostConfig.Privileged}}') printf '%s\n' false ;;
    '{{.HostConfig.NetworkMode}}') printf '%s\n' default ;;
    '{{.HostConfig.Memory}}') printf '%s\n' 536870912 ;;
    '{{.HostConfig.PidsLimit}}') printf '%s\n' 128 ;;
    '{{.RestartCount}}') printf '%s\n' 0 ;;
    '{{if .State.Health}}{{.State.Health.Status}}{{else}}disabled{{end}}')
      if [[ "$container_id" == "api-id" ]]; then
        printf '%s\n' healthy
      else
        printf '%s\n' "${MOCK_WORKER_HEALTHCHECK:-disabled}"
      fi
      ;;
    '{{json .HostConfig.PortBindings}}')
      printf '%s\n' '{"18765/tcp":[{"HostIp":"127.0.0.1","HostPort":"18765"}]}'
      ;;
    '{{range .Mounts}}{{if eq .Destination "/palworld-save"}}{{.RW}}{{end}}{{end}}')
      printf '%s\n' false
      ;;
    '{{.Config.Image}}') printf '%s\n' 'test.invalid/agent:previous@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' ;;
    *) printf 'unexpected inspect format for %s: %s\n' "$container_id" "$format" >&2; exit 64 ;;
  esac
  exit 0
fi
if [[ "${1:-}" == "compose" ]]; then
  command_name=""
  for argument in "$@"; do
    case "$argument" in config|ps|logs|up|down) command_name="$argument"; break ;; esac
  done
  case "$command_name" in
    config) exit 0 ;;
    ps)
      if [[ -f "$MOCK_STATE/deployed" ]]; then
        service="${*: -1}"
        printf '%s-id\n' "$service"
      fi
      ;;
    logs) exit 0 ;;
    up) touch "$MOCK_STATE/deployed" ;;
    down)
      rm -f -- "$MOCK_STATE/deployed"
      touch "$MOCK_STATE/rolled-back"
      ;;
    *) exit 64 ;;
  esac
  exit 0
fi
exit 64
MOCK

cat >"$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "$MOCK_STATE/curl-count" ]]; then count="$(cat "$MOCK_STATE/curl-count")"; fi
count=$((count + 1))
printf '%s\n' "$count" >"$MOCK_STATE/curl-count"
if (( count <= MOCK_CURL_FAILURES )); then exit 56; fi
exit 0
MOCK

cat >"$MOCK_BIN/sleep" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK

chmod +x "$MOCK_BIN/git" "$MOCK_BIN/docker" "$MOCK_BIN/curl" "$MOCK_BIN/sleep"

cat >"$ENV_FILE" <<EOF
AGENT_IMAGE=test.invalid/agent:test@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
DEPLOY_GIT_SHA=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
PALHATCH_DATA_DIR=$DATA_DIR
EOF
chmod 0600 "$ENV_FILE"

touch "$MOCK_STATE/deployed"
MOCK_REPO_ROOT="$REPO_ROOT" MOCK_STATE="$MOCK_STATE" MOCK_CURL_FAILURES=2 \
  PATH="$MOCK_BIN:$PATH" ENV_FILE="$ENV_FILE" \
  "$REPO_ROOT/infra/agent/scripts/verify-production.sh" >/dev/null
test "$(cat "$MOCK_STATE/curl-count")" = 10

rm -f -- "$MOCK_STATE/curl-count"
set +e
worker_health_output=$(MOCK_REPO_ROOT="$REPO_ROOT" MOCK_STATE="$MOCK_STATE" \
  MOCK_CURL_FAILURES=0 MOCK_WORKER_HEALTHCHECK=unhealthy \
  PATH="$MOCK_BIN:$PATH" ENV_FILE="$ENV_FILE" \
  "$REPO_ROOT/infra/agent/scripts/verify-production.sh" 2>&1)
worker_health_status=$?
set -e
test "$worker_health_status" = 73
grep -Fq AGENT_WORKER_HEALTHCHECK_ENABLED:job-worker <<<"$worker_health_output"

rm -f -- "$MOCK_STATE/deployed" "$MOCK_STATE/rolled-back" "$MOCK_STATE/curl-count"
set +e
deploy_output=$(run_as_root env \
  "MOCK_REPO_ROOT=$REPO_ROOT" "MOCK_STATE=$MOCK_STATE" "MOCK_CURL_FAILURES=100" \
  "PATH=$MOCK_BIN:$PATH" "ENV_FILE=$ENV_FILE" \
  "$REPO_ROOT/infra/agent/scripts/deploy-production.sh" 2>&1)
deploy_status=$?
set -e
test "$deploy_status" = 73
test -f "$MOCK_STATE/rolled-back"
test ! -f "$MOCK_STATE/deployed"
grep -Fq AGENT_HEALTH_NOT_READY <<<"$deploy_output"
grep -Fq AGENT_DEPLOY_FAILED_ROLLBACK_FINISHED <<<"$deploy_output"

echo "Production deployment readiness and first-deploy rollback regression passed."
