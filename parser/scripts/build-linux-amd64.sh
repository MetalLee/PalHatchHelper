#!/bin/sh
set -eu

invocation_directory="$(pwd)"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
parser_directory="$(dirname -- "$script_directory")"

expected_go_version="go1.26.5"
actual_go_version="$(go env GOVERSION)"
if [ "$actual_go_version" != "$expected_go_version" ]; then
  echo "expected ${expected_go_version}, got ${actual_go_version}" >&2
  exit 1
fi
if ! command -v g++ >/dev/null 2>&1; then
  echo "g++ is required to build the vendored decode-only C++ core" >&2
  exit 1
fi

output_path="${1:-palworld-save-parser}"
case "$output_path" in
  /*) ;;
  *) output_path="${invocation_directory}/${output_path}" ;;
esac
mkdir -p "$(dirname -- "$output_path")"
cd "$parser_directory"
CGO_ENABLED=1 GOOS=linux GOARCH=amd64 \
  go build -mod=vendor -trimpath -buildvcs=false \
  -ldflags='-s -w -buildid= -extldflags "-Wl,--build-id=none -static-libstdc++ -static-libgcc"' \
  -o "$output_path" ./cmd/palworld-save-parser
