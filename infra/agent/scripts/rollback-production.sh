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
if [[ "$(git -C "$REPO_ROOT" rev-parse --show-toplevel)" != "$REPO_ROOT" ]]; then echo "ROLLBACK_WORKDIR_INVALID" >&2; exit 65; fi
if [[ ! -f "$ENV_FILE" || "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then echo "PRODUCTION_ENV_INVALID" >&2; exit 66; fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${PALHATCH_DATA_DIR:?PALHATCH_DATA_DIR is required}"
state_file="$PALHATCH_DATA_DIR/runtime/previous-agent-image"
if [[ ! -r "$state_file" ]]; then echo "PREVIOUS_AGENT_IMAGE_MISSING" >&2; exit 67; fi
previous_image="$(<"$state_file")"
if [[ "$previous_image" == *latest* || ! "$previous_image" =~ ^[^[:space:]@]+:[^[:space:]@]+@sha256:[0-9a-f]{64}$ ]]; then
  echo "PREVIOUS_AGENT_IMAGE_INVALID" >&2; exit 68
fi
if $DRY_RUN; then echo "DRY_RUN: switch API and active workers to the recorded previous immutable image without touching save-worker"; exit 0; fi
compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
AGENT_IMAGE="$previous_image" "${compose[@]}" config --quiet
AGENT_IMAGE="$previous_image" "${compose[@]}" up -d --no-deps "${SERVICES[@]}" >/dev/null
ENV_FILE="$ENV_FILE" AGENT_IMAGE="$previous_image" "$SCRIPT_DIR/verify-production.sh"
echo "AGENT_ROLLBACK_VERIFIED"
