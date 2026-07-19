#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  if [[ "$EUID" -eq 0 ]]; then
    rm -rf -- "$TEST_ROOT"
    return
  fi
  sudo -n rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

DATA_DIR="$TEST_ROOT/data"
mkdir -p "$DATA_DIR/game-catalog/cache"
printf '%s\n' preserved >"$DATA_DIR/game-catalog/cache/existing-artifact"
mkdir -p "$DATA_DIR/game-catalog/normalized/version-one"
printf '%s\n' immutable >"$DATA_DIR/game-catalog/normalized/version-one/manifest.json"
chmod 0700 "$DATA_DIR/game-catalog/normalized/version-one"
chmod 0600 "$DATA_DIR/game-catalog/normalized/version-one/manifest.json"
base_metadata="$(stat -c '%u:%g:%a' "$DATA_DIR")"

run_as_root() {
  if [[ "$EUID" -eq 0 ]]; then
    "$@"
    return
  fi
  sudo -n "$@"
}

for attempt in 1 2; do
  run_as_root \
    "$REPO_ROOT/infra/agent/scripts/prepare-production-data.sh" "$DATA_DIR"
done

test "$(stat -c '%u:%g:%a' "$DATA_DIR")" = "$base_metadata"
test "$(run_as_root cat "$DATA_DIR/game-catalog/cache/existing-artifact")" = preserved
test "$(run_as_root stat -c '%u:%g:%a' "$DATA_DIR/game-catalog/cache/existing-artifact")" = \
  '10001:10001:600'
test "$(run_as_root cat "$DATA_DIR/game-catalog/normalized/version-one/manifest.json")" = \
  immutable
test "$(run_as_root stat -c '%u:%g:%a' "$DATA_DIR/game-catalog/normalized/version-one")" = \
  '10001:10001:700'
test "$(run_as_root stat -c '%u:%g:%a' "$DATA_DIR/game-catalog/normalized/version-one/manifest.json")" = \
  '10001:10001:600'

for relative_path in \
  runtime \
  snapshots \
  game-catalog/extraction/staging \
  game-catalog/extraction/raw \
  game-catalog/extraction/failed \
  game-catalog/normalized \
  game-catalog/bundles \
  game-catalog/cache \
  game-catalog/runtime; do
  directory="$DATA_DIR/$relative_path"
  run_as_root test -d "$directory"
  test "$(run_as_root stat -c '%u:%g:%a' "$directory")" = '10001:10001:700'
done

ln -s "$TEST_ROOT" "$DATA_DIR/game-catalog/normalized/escape"
set +e
symlink_output=$(run_as_root \
  "$REPO_ROOT/infra/agent/scripts/prepare-production-data.sh" "$DATA_DIR" 2>&1)
symlink_status=$?
set -e
test "$symlink_status" = 69
grep -Fq AGENT_DATA_DIR_SYMLINK_FORBIDDEN <<<"$symlink_output"

set +e
run_as_root \
  "$REPO_ROOT/infra/agent/scripts/prepare-production-data.sh" relative/path \
  >/dev/null 2>&1
invalid_path_status=$?
set -e
test "$invalid_path_status" = 69

echo "Production Agent data directory regression passed."
