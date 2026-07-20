# PalHatchHelper PlM CanonicalSnapshot Parser

`palworld-save-parser` is a Linux x86-64, decode-only parser for Palworld
`Level.sav` and declared `Players/*.sav` files. It supports:

- `PlM/0x31`: Oodle Mermaid through an operator-supplied, SHA-256-pinned
  `liboo2corelinux64.so.9`.
- `PlZ/0x31`: one zlib layer.
- `PlZ/0x32`: two zlib layers.

It has no save encoder, no write-back operation, no network client, and no
child-process call. The decompressed body must begin with `GVAS`.

## Runtime

```text
PALHATCH_WORLD_UID=<configured REST worldguid>
PALHATCH_OODLE_LIB=/app/parser/lib/liboo2corelinux64.so.9
PALHATCH_OODLE_SHA256=<64 lowercase hex characters>
```

If `PALHATCH_OODLE_LIB` is absent, the parser checks only
`<parser-bundle>/lib/liboo2corelinux64.so.9`. The hash pin comes from
`PALHATCH_OODLE_SHA256`, or, for standalone operation, the first field of an
adjacent `.sha256` file. Missing libraries and pins fail closed; nothing is
downloaded.

```bash
/app/parser/palworld-save-parser \
  --snapshot "{snapshot_path}" \
  --output "{output_path}"
```

The snapshot directory is the only save-data read root. Output is created
exclusively at `--output`, must not already exist, cannot be inside the
snapshot, and is capped at 64 MiB.

## Reproducible build

The source and Unicode normalization dependency are vendored. The checked-in
binary is built in the official Go 1.26.5 Debian container:

```bash
docker run --rm \
  -v "$PWD/parser:/src" -w /src golang:1.26.5-bookworm \
  sh -c '/usr/local/go/bin/go test -mod=vendor ./... && \
    CGO_ENABLED=1 /usr/local/go/bin/go build -mod=vendor -trimpath \
    -ldflags="-s -w -buildid= -extldflags=-Wl,--build-id=none" \
    -o palworld-save-parser ./cmd/palworld-save-parser'
```

The resulting binary links only glibc/`libdl`; Oodle remains a separately
loaded runtime file and is never embedded.
