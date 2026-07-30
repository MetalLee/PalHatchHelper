#!/bin/sh
set -eu

invocation_directory="$(pwd)"
script_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
parser_directory="$(dirname -- "$script_directory")"

expected_go_version="go1.26.5"
expected_mingw_driver_version="13-posix"
expected_mingw_package_version="13.2.0-6ubuntu1+26.1"
actual_go_version="$(go env GOVERSION)"
if [ "$actual_go_version" != "$expected_go_version" ]; then
  echo "expected ${expected_go_version}, got ${actual_go_version}" >&2
  exit 1
fi

cc="${CC:-x86_64-w64-mingw32-gcc-posix}"
cxx="${CXX:-x86_64-w64-mingw32-g++-posix}"
for compiler in "$cc" "$cxx"; do
  if ! command -v "$compiler" >/dev/null 2>&1; then
    echo "${compiler} is required for the Windows x64 build" >&2
    exit 1
  fi
  actual_mingw_driver_version="$($compiler -dumpfullversion)"
  if [ "$actual_mingw_driver_version" != "$expected_mingw_driver_version" ]; then
    echo "expected MinGW-w64 GCC driver ${expected_mingw_driver_version}, got ${actual_mingw_driver_version}" >&2
    exit 1
  fi
done
if ! command -v dpkg-query >/dev/null 2>&1; then
  echo "the pinned Ubuntu MinGW-w64 package metadata is required" >&2
  exit 1
fi
actual_mingw_package_version="$(dpkg-query -W -f='${Version}' gcc-mingw-w64-x86-64-posix)"
if [ "$actual_mingw_package_version" != "$expected_mingw_package_version" ]; then
  echo "expected MinGW-w64 package ${expected_mingw_package_version}, got ${actual_mingw_package_version}" >&2
  exit 1
fi

output_path="${1:-palworld-save-parser.exe}"
case "$output_path" in
  /*) ;;
  *) output_path="${invocation_directory}/${output_path}" ;;
esac
mkdir -p "$(dirname -- "$output_path")"
cd "$parser_directory"
CGO_ENABLED=1 GOOS=windows GOARCH=amd64 CC="$cc" CXX="$cxx" \
  go build -mod=vendor -trimpath -buildvcs=false \
  -ldflags='-s -w -buildid= -extldflags "-static -static-libgcc -static-libstdc++ -Wl,--no-insert-timestamp"' \
  -o "$output_path" ./cmd/palworld-save-parser
