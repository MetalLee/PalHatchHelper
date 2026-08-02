# PalBeacon PlM CanonicalSnapshot Parser

`palworld-save-parser` 1.4.5 is a Linux x64 and Windows x64 decode-only parser
for Palworld `Level.sav` and declared `Players/*.sav` files. It supports:

- `PlM/0x31`, including Mermaid streams, through the vendored open-source
  palooz/ooz decoder;
- `PlZ/0x31` with one zlib layer;
- `PlZ/0x32` with two zlib layers.

Version 1.4.5 reads the retail direct
`ItemContainerSaveData.Value.Slots[].RawData` layout (while tolerating the
legacy decoded wrapper) and joins each container to the explicit base and guild IDs in `MapObjectSaveData.Model.RawData`.
The map position is only a consistency check, never ownership evidence.
Cold feed-box input slots and completed public-output slots are classified by
their confirmed facility and slot semantics. Other input slots, personal
inventory, unfinished structures, and explicitly unowned containers are
excluded; structural drift remains explicitly partial.

Dimensional-storage Pal Character IDs that differ from ordinary inventory only
by ASCII letter case share the same stable ID while retaining each source
spelling in audit metadata. Other stable-ID collisions still fail closed.

The palooz/ooz source is pinned to PalworldSaveTools commit
`3395e393466fc1f384dee54dabb3e597e611435e`. The exact vendored files,
SHA-256 values, decode-only patch, and manual update procedure are in
[`third_party/palooz/UPSTREAM.md`](third_party/palooz/UPSTREAM.md).

The Linux executable is self-contained apart from the normal Linux glibc
runtime. The Windows executable statically links the MinGW GCC/C++ runtime and
uses only Windows system DLLs. Neither executable needs Python, palsav, a
proprietary Oodle library, a package installer, or a network download.
PalBeacon does not distribute proprietary Oodle files.

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
decoder inputs are vendored. Build Linux x64 in the pinned Go 1.26.5 container
with GCC/G++ and CGO enabled:

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

Build Windows x64 from Linux in the repository's digest-pinned Go/Ubuntu
container. It pins MinGW-w64 GCC/G++ 13.2.0, binutils
2.41.90.20240122, and the MinGW-w64 11.0.1 headers:

```bash
docker build --network host \
  -f parser/Dockerfile.windows-amd64 \
  -t palbeacon-parser-windows-amd64 .
docker run --rm \
  -v "$PWD:/workspace" -w /workspace/parser \
  palbeacon-parser-windows-amd64 \
  ./scripts/build-windows-amd64.sh \
  build/win32-x64/palworld-save-parser.exe
```

The Windows script also clears the Go build ID and PE linker timestamp, strips
debug symbols, and statically links the GCC/C++ runtime. Run it twice and
compare SHA-256 values before packaging.

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

Both platform Parser executables are built from the same source and
distributed under GPL-3.0-or-later because they integrate the GPL palooz/ooz
decoder. Parser code derived from palhelm retains its Apache-2.0 notices. This
does not relicense the entire PalHatchHelper repository or the separate
TypeScript Sync CLI. See
[`LICENSE`](LICENSE), [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md), and
[`LICENSES/`](LICENSES/).
