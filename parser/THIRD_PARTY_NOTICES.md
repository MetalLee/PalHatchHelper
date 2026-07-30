# Third-party notices

These notices apply equally to the Linux x64 and Windows x64 Parser
executables. Both platform artifacts are built from the same Parser source and
the same pinned upstream commits.

## palooz/ooz decoder from PalworldSaveTools

The decode-only C++ sources under `third_party/palooz` are vendored from
[deafdudecomputers/PalworldSaveTools](https://github.com/deafdudecomputers/PalworldSaveTools)
at commit `3395e393466fc1f384dee54dabb3e597e611435e`. The upstream palsav/palooz
package declares GPL-3.0-or-later. The ooz decoder files retain their original
notices, including the 2016 Powzix copyright and GPL-3.0-or-later notice in
`kraken.cpp`. The full GPL text is in `LICENSES/GPL-3.0-or-later.txt` and
`third_party/palooz/LICENSE`.

PalBeacon vendors only the three decoder translation units and their required
headers. One local preprocessor guard excludes the unused generic upstream C
wrapper and compression entry point; PalBeacon provides a smaller bounded
decode-only C ABI, and no decoder statement is changed. No Python binding, GUI/editor,
compressor, encoder, save writer, or upstream test save is included. Exact
file hashes and the patch description are in
`third_party/palooz/UPSTREAM.md`.

The vendored SIMDe headers retain their per-file MIT or CC0-1.0 notices. Full
texts are in `LICENSES/SIMDe-MIT.txt` and `LICENSES/CC0-1.0.txt`.

## 8tp/palhelm save parser

Files under `internal/sav` marked with a modification notice are derived from
the decode-only save parser in [8tp/palhelm](https://github.com/8tp/palhelm),
pinned to commit `e099e8afe4823d6cf6b371e5e3938955e5a1becd`. Palhelm is
licensed under Apache License 2.0; the full license is in
`LICENSES/Apache-2.0.txt`.

PalHatchHelper retained the GVAS and CanonicalSnapshot parsing path, removed
the external proprietary decoder loader, added a vendored decode-only bridge,
added stable-ID normalization, and made declared player-file failures fail
closed. It does not include a save encoder or write-back path.

## golang.org/x/text

The vendored Unicode normalization code under `vendor/golang.org/x/text` is
Copyright 2009 The Go Authors and uses the BSD 3-Clause license reproduced in
`vendor/golang.org/x/text/LICENSE`. It is used only to implement the shared
`palworld-stable-id-v1` NFKC mapping.

## Proprietary Oodle software

No proprietary Oodle source or binary is part of this repository, Parser
executable, npm package, or Agent image. The Parser uses only the pinned
open-source decoder described above.
