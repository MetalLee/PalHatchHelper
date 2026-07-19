#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <agent-data-directory>" >&2
  exit 64
fi

if [[ "$EUID" -ne 0 ]]; then
  echo "AGENT_DATA_DIR_PRIVILEGES_REQUIRED" >&2
  exit 69
fi

data_dir="$1"
if [[ "$data_dir" != /* || ! -d "$data_dir" ]]; then
  echo "AGENT_DATA_DIR_INVALID" >&2
  exit 69
fi

resolved_data_dir="$(realpath -e -- "$data_dir")"
case "$resolved_data_dir" in
  /|/opt/palworld|/opt/palworld/*)
    echo "AGENT_DATA_DIR_FORBIDDEN" >&2
    exit 69
    ;;
esac

agent_uid=10001
agent_gid=10001
directories=(
  "$resolved_data_dir/runtime"
  "$resolved_data_dir/snapshots"
  "$resolved_data_dir/game-catalog/cache"
  "$resolved_data_dir/game-catalog/runtime"
)

for directory in "${directories[@]}"; do
  resolved_directory="$(realpath -m -- "$directory")"
  case "$resolved_directory" in
    "$resolved_data_dir"/*) ;;
    *)
      echo "AGENT_DATA_DIR_TARGET_FORBIDDEN" >&2
      exit 69
      ;;
  esac
done

install -d -o "$agent_uid" -g "$agent_gid" -m 0700 -- "${directories[@]}"

for directory in "${directories[@]}"; do
  if [[ "$(stat -c '%u:%g:%a' "$directory")" != "$agent_uid:$agent_gid:700" ]]; then
    echo "AGENT_DATA_DIR_PERMISSIONS_INVALID" >&2
    exit 69
  fi
done

echo "AGENT_PRODUCTION_DATA_PREPARED"
