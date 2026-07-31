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
if [[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" != "$REPO_ROOT" ]]; then
  echo "DEPLOY_WORKDIR_INVALID" >&2; exit 65
fi
if [[ ! -f "$ENV_FILE" ]]; then echo "PRODUCTION_ENV_MISSING" >&2; exit 66; fi
if [[ "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then echo "PRODUCTION_ENV_PERMISSIONS_INVALID" >&2; exit 66; fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${AGENT_IMAGE:?AGENT_IMAGE is required}"
: "${DEPLOY_GIT_SHA:?DEPLOY_GIT_SHA is required}"
: "${PALHATCH_DATA_DIR:?PALHATCH_DATA_DIR is required}"
git_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [[ "$git_sha" != "$DEPLOY_GIT_SHA" ]]; then echo "DEPLOY_GIT_SHA_MISMATCH" >&2; exit 67; fi
if [[ "$AGENT_IMAGE" == *latest* || ! "$AGENT_IMAGE" =~ ^[^[:space:]@]+:[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
  echo "AGENT_IMAGE_NOT_IMMUTABLE" >&2; exit 68
fi
if [[ ! -d "$PALHATCH_DATA_DIR" ]]; then echo "AGENT_DATA_DIR_MISSING" >&2; exit 69; fi
available_kib="$(df -Pk "$PALHATCH_DATA_DIR" | awk 'NR==2 {print $4}')"
if (( available_kib < 2097152 )); then echo "AGENT_DISK_SPACE_LOW" >&2; exit 69; fi
if command -v ss >/dev/null && ss -ltn | awk '{print $4}' | grep -Eq '(^|:)0\.0\.0\.0:18765$|^\[::\]:18765$'; then
  echo "AGENT_HEALTH_PORT_PUBLIC" >&2; exit 70
fi

compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
if $DRY_RUN; then
  echo "DRY_RUN: validate immutable image, Compose, loopback health port, disk, deploy API and active workers without save-worker, then verify"
  exit 0
fi

docker pull "$AGENT_IMAGE" >/dev/null
expected_digest="${AGENT_IMAGE##*@}"
if ! docker image inspect "$AGENT_IMAGE" --format '{{json .RepoDigests}}' | grep -Fq "$expected_digest"; then
  echo "AGENT_IMAGE_DIGEST_MISMATCH" >&2; exit 68
fi
"${compose[@]}" config --quiet

"$SCRIPT_DIR/prepare-production-data.sh" "$PALHATCH_DATA_DIR"
runtime_dir="$PALHATCH_DATA_DIR/runtime"
previous_image=""
api_id="$("${compose[@]}" ps -q api 2>/dev/null || true)"
if [[ -n "$api_id" ]]; then previous_image="$(docker inspect --format '{{.Config.Image}}' "$api_id")"; fi
if [[ -n "$previous_image" && "$previous_image" =~ @sha256:[0-9a-f]{64}$ ]]; then
  umask 077
  printf '%s\n' "$previous_image" >"$runtime_dir/previous-agent-image"
fi

rollback_on_error() {
  local exit_code=$?
  local rollback_failed=false
  trap - ERR
  echo "AGENT_DEPLOY_FAILED_ROLLBACK_STARTED" >&2
  if [[ -n "$previous_image" && "$previous_image" =~ @sha256:[0-9a-f]{64}$ ]]; then
    AGENT_IMAGE="$previous_image" "${compose[@]}" up -d --no-deps "${SERVICES[@]}" >/dev/null \
      || rollback_failed=true
  else
    "${compose[@]}" rm --stop --force "${SERVICES[@]}" >/dev/null || rollback_failed=true
  fi
  if $rollback_failed; then
    echo "AGENT_DEPLOY_FAILED_ROLLBACK_FAILED" >&2
  else
    echo "AGENT_DEPLOY_FAILED_ROLLBACK_FINISHED" >&2
  fi
  exit "$exit_code"
}
trap rollback_on_error ERR

"${compose[@]}" up -d --no-deps "${SERVICES[@]}" >/dev/null
ENV_FILE="$ENV_FILE" "$SCRIPT_DIR/verify-production.sh"
trap - ERR
echo "AGENT_DEPLOY_VERIFIED"
