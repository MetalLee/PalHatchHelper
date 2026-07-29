# PalBeacon PlM CanonicalSnapshot Parser

`palworld-save-parser` 1.2.0 is a Linux x86-64, decode-only parser for
Palworld `Level.sav` and declared `Players/*.sav` files. It supports:

- `PlM/0x31`, including Mermaid streams, through the vendored open-source
  palooz/ooz decoder;
- `PlZ/0x31` with one zlib layer;
- `PlZ/0x32` with two zlib layers.

The palooz/ooz source is pinned to PalworldSaveTools commit
`3395e393466fc1f384dee54dabb3e597e611435e`. The exact vendored files,
SHA-256 values, decode-only patch, and manual update procedure are in
[`third_party/palooz/UPSTREAM.md`](third_party/palooz/UPSTREAM.md).

The executable is self-contained apart from the normal Linux glibc runtime.
It does not need Python, palsav, a proprietary Oodle library, a package
installer, or a network download. PalBeacon does not distribute proprietary
Oodle files.

## Read-only runtime

```bash
PALHATCH_WORLD_UID=<configured-world-uid> \
  ./palworld-save-parser \
  --snapshot "{snapshot_path}" \
  --output "{output_path}"
```

`PALHATCH_WORLD_UID` is needed only when the synthetic or legacy GVAS data
does not provide an unambiguous matching world identifier. The optional
`PALHATCH_SAV_MAX_BYTES` can lower the default maximum input size.

The snapshot directory is the only save-data read root. The Parser has no
network client, child-process call, save encoder, compression path, or
write-back operation. It creates only the requested output, refuses an
existing output path or an output inside the snapshot, caps JSON output at
64 MiB, requires exact decompressed length, and requires the decoded body to
begin with `GVAS`. Callers additionally run it as a resource-limited,
network-denied subprocess over a stable read-only copy.

## Build and test

The version has one source: [`VERSION`](VERSION). The Go module and C++
decoder inputs are vendored. Build in Linux amd64 with Go 1.26.5, GCC/G++,
and CGO enabled:

```bash
docker run --rm \
  -v "$PWD:/workspace" -w /workspace/parser \
  golang:1.26.5-bookworm \
  sh -c './scripts/build-linux-amd64.sh'
```

The script uses `-trimpath`, disables embedded VCS metadata with
`-buildvcs=false`, strips symbols, clears Go and ELF build IDs, and requests
static `libstdc++`/`libgcc` linkage. The resulting executable should show only
glibc and the Linux loader in `ldd`; it must never link a separate
decompression runtime.

Run the complete Parser checks in the same environment:

```bash
go test -mod=vendor ./...
go vet ./...
```

The committed `data/parser-fixtures/plm-minimal/Level.sav` is a real Mermaid
PlM container built from the repository's synthetic GVAS fixture. It contains
only fictional identifiers and is decoded byte-for-byte by the production
decoder in tests. The production Parser does not include the one-time fixture
compression tool.

## Licensing

The combined Parser executable is distributed under GPL-3.0-or-later because
it integrates the GPL palooz/ooz decoder. Parser code derived from palhelm
retains its Apache-2.0 notices. This does not relicense the entire
PalHatchHelper repository or the separate TypeScript Sync CLI. See
[`LICENSE`](LICENSE), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and
[`LICENSES/`](LICENSES/).
