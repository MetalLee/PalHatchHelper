#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/infra/agent/docker-compose.production.yml"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/infra/agent/.env.production}"
PROJECT_NAME="palhatchhelper-agent"
SERVICES=(api job-worker command-worker)
DRY_RUN=false

if [[ "${1:-}" == "--dry-run" ]]; then DRY_RUN=true; shift; fi
if [[ $# -ne 0 ]]; then echo "usage: $0 [--dry-run]" >&2; exit 64; fi
if [[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" != "$REPO_ROOT" ]]; then echo "VERIFY_WORKDIR_INVALID" >&2; exit 65; fi
if [[ ! -f "$ENV_FILE" || "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then echo "PRODUCTION_ENV_INVALID" >&2; exit 66; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
if $DRY_RUN; then echo "DRY_RUN: inspect API and active worker containers without save-worker, hardening, RO command-worker save mount, loopback binding, health and redacted logs"; exit 0; fi

compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
"${compose[@]}" config --quiet
for service in "${SERVICES[@]}"; do
  container_id="$("${compose[@]}" ps -q "$service")"
  [[ -n "$container_id" ]] || { echo "AGENT_SERVICE_MISSING:$service" >&2; exit 71; }
  [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "true" ]] || { echo "AGENT_SERVICE_NOT_RUNNING:$service" >&2; exit 71; }
  [[ "$(docker inspect --format '{{.Config.User}}' "$container_id")" == "10001:10001" ]] || { echo "AGENT_CONTAINER_USER_INVALID:$service" >&2; exit 72; }
  docker inspect --format '{{json .HostConfig.CapDrop}}' "$container_id" | grep -Fq 'ALL' || { echo "AGENT_CAP_DROP_INVALID:$service" >&2; exit 72; }
  docker inspect --format '{{json .HostConfig.SecurityOpt}}' "$container_id" | grep -Fq 'no-new-privileges' || { echo "AGENT_SECURITY_OPT_INVALID:$service" >&2; exit 72; }
  [[ "$(docker inspect --format '{{.HostConfig.Privileged}}' "$container_id")" == "false" ]] || { echo "AGENT_PRIVILEGED_INVALID:$service" >&2; exit 72; }
  [[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container_id")" != "host" ]] || { echo "AGENT_HOST_NETWORK_FORBIDDEN:$service" >&2; exit 72; }
  [[ "$(docker inspect --format '{{.HostConfig.Memory}}' "$container_id")" -gt 0 ]] || { echo "AGENT_MEMORY_LIMIT_MISSING:$service" >&2; exit 72; }
  [[ "$(docker inspect --format '{{.HostConfig.PidsLimit}}' "$container_id")" -gt 0 ]] || { echo "AGENT_PIDS_LIMIT_MISSING:$service" >&2; exit 72; }
  if [[ "$service" != "api" ]]; then
    health_status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}disabled{{end}}' "$container_id")"
    [[ "$health_status" == "disabled" ]] || { echo "AGENT_WORKER_HEALTHCHECK_ENABLED:$service" >&2; exit 73; }
  fi
done

api_id="$("${compose[@]}" ps -q api)"
ports="$(docker inspect --format '{{json .HostConfig.PortBindings}}' "$api_id")"
[[ "$ports" == *'127.0.0.1'* && "$ports" != *'0.0.0.0'* ]] || { echo "AGENT_HEALTH_BINDING_INVALID" >&2; exit 73; }
for service in command-worker; do
  container_id="$("${compose[@]}" ps -q "$service")"
  docker inspect --format '{{range .Mounts}}{{if eq .Destination "/palworld-save"}}{{.RW}}{{end}}{{end}}' "$container_id" | grep -Fxq 'false' || { echo "PALWORLD_SAVE_MOUNT_NOT_READ_ONLY:$service" >&2; exit 73; }
done

services_stable() {
  local service container_id
  for service in "${SERVICES[@]}"; do
    container_id="$("${compose[@]}" ps -q "$service")"
    [[ -n "$container_id" ]] || return 1
    [[ "$(docker inspect --format '{{.State.Running}}' "$container_id")" == "true" ]] || return 1
    [[ "$(docker inspect --format '{{.RestartCount}}' "$container_id")" == "0" ]] || return 1
  done
}

readiness_max_attempts=30
readiness_required_successes=8
readiness_successes=0
for ((attempt = 1; attempt <= readiness_max_attempts; attempt++)); do
  if curl --fail --silent --max-time 5 http://127.0.0.1:18765/healthz >/dev/null \
    && services_stable; then
    readiness_successes=$((readiness_successes + 1))
    if (( readiness_successes >= readiness_required_successes )); then break; fi
  else
    readiness_successes=0
  fi
  if (( attempt < readiness_max_attempts )); then sleep 2; fi
done
if (( readiness_successes < readiness_required_successes )); then
  echo "AGENT_HEALTH_NOT_READY" >&2
  exit 73
fi

logs_file="$(mktemp)"
trap 'rm -f "$logs_file"' EXIT
"${compose[@]}" logs --no-color --tail 300 "${SERVICES[@]}" >"$logs_file"
for variable_name in SUPABASE_SERVICE_ROLE_KEY AI_OPENAI_COMPATIBLE_API_KEY SUPABASE_DB_PASSWORD; do
  value="${!variable_name:-}"
  if [[ -n "$value" ]] && grep -Fq -- "$value" "$logs_file"; then echo "AGENT_LOG_SECRET_DETECTED" >&2; exit 74; fi
done
if grep -Eiq '(service[_ -]?role|bearer[[:space:]]+[A-Za-z0-9._-]{16,}|api[_ -]?key[=:][^[:space:]]{8,})' "$logs_file"; then
  echo "AGENT_LOG_SECRET_PATTERN_DETECTED" >&2; exit 74
fi
echo "AGENT_PRODUCTION_VERIFIED"
