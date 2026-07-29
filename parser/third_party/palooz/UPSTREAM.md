# palooz/ooz upstream provenance

- Upstream repository: <https://github.com/deafdudecomputers/PalworldSaveTools>
- Pinned commit: `3395e393466fc1f384dee54dabb3e597e611435e`
- Upstream package: `src/palsav` (`palsav-flex` 0.2.0 / `palooz` 0.2.0)
- Upstream license declaration: `GPL-3.0-or-later` in
  `src/palsav/pyproject.toml`
- Full upstream license: `LICENSE` in this directory, copied byte-for-byte from
  upstream `src/palsav/LICENSE`

Only the decoder path is compiled. The production Parser includes
`Kraken_Decompress` and its Kraken/Mermaid/Selkie/LZNA/Bitknit/Leviathan decode
support. It does not vendor or compile `compress.cpp`, any `compr_*.cpp`, the
Python binding, palsav, GUI/editor code, save writers, or test saves.

## Vendored files

All paths except `kraken.cpp` are copied byte-for-byte from the pinned commit.
SHA-256 is calculated over the vendored file contents.

| Vendored path                                  | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `LICENSE`                                      | `6be6ef69519389d7833e3d766380ed52f543f2024e98f61dfa22e69a1a12a72b` |
| `ooz/dep/ooz/bitknit.cpp`                      | `dc2cc2447c8a3a06e125678ee98a829025a8653f7e055f96e7005e29e0ed368c` |
| `ooz/dep/ooz/kraken.cpp`                       | `72dbc4dce92aa9274bd189da72afcc045aecf5b30258898113b5fa9085574506` |
| `ooz/dep/ooz/lzna.cpp`                         | `50cd7aa179e5d571814a5bc132d2344f2151bcaf3eea56714d391f88a25e61c9` |
| `ooz/dep/ooz/stdafx.h`                         | `6a667c8822ca70cd8bc808f33a280639205f461390036af8786c3dca1f6a4528` |
| `ooz/dep/ooz/simde/simde/check.h`              | `5fb278f5294101ce081f32ed0a931f994bf7dbd83ed69357703a2240a93151c6` |
| `ooz/dep/ooz/simde/simde/debug-trap.h`         | `ac2841ade8b99dd6d38bdebc59c1d1444f901baa1bd7b6b60f50317472d77c01` |
| `ooz/dep/ooz/simde/simde/hedley.h`             | `8b325e7b78db665c5400c8d596d64e7f29b322b700469aeacbc1f5849f8344d0` |
| `ooz/dep/ooz/simde/simde/simde-align.h`        | `948d91b0f12f49440cb2e73c09cee27d71679a7b8be4e55f174af0d3a88fcb2d` |
| `ooz/dep/ooz/simde/simde/simde-arch.h`         | `668c834dc25a463b8da6f892bb06ee8a34569dcb2e2c6b74d93cc2d2845b7e60` |
| `ooz/dep/ooz/simde/simde/simde-common.h`       | `b13cf87e7533c5a7f9dc56cd57cd156abcc3b71d0f1dde7c629f24370045c526` |
| `ooz/dep/ooz/simde/simde/simde-constify.h`     | `08e029bce27502966e7ba0a0886e17aea3ee997f9ec25f962529364d7c7d711d` |
| `ooz/dep/ooz/simde/simde/simde-detect-clang.h` | `bf0613d16c8f503faf07975873a97c2605183c848b41da815c7291af1fd728b8` |
| `ooz/dep/ooz/simde/simde/simde-diagnostic.h`   | `4f92f558ddf6ae57ad38ad0e279d88d0b582df2bd77fd616e9b0f51cbc78ee2b` |
| `ooz/dep/ooz/simde/simde/simde-f16.h`          | `6aa7eba8395304f8b618d56392865201d4f75822111d59629680fc95dd5383af` |
| `ooz/dep/ooz/simde/simde/simde-features.h`     | `e5a9494f96f0ad15c0231409b6b14dc0f339a2b1cca992247ab123eb9e595d41` |
| `ooz/dep/ooz/simde/simde/simde-math.h`         | `7c642e5cd37d4fd25b2737305920d6bd1f1685717b1ade928d119a55f7728c55` |
| `ooz/dep/ooz/simde/simde/x86/mmx.h`            | `c7a07105b3fc5b951faaba3c4fd75c7d7e0e800cadb259adf692343d73150bd5` |
| `ooz/dep/ooz/simde/simde/x86/sse.h`            | `4f8d3ded5aa407aa1052f883ed82a348e66941ade25bc1449cb39cd998273f7b` |
| `ooz/dep/ooz/simde/simde/x86/sse2.h`           | `66321e1ac3f6ccfedc0e237803e8c22c4344e9b04194b42507edb476252873d0` |

The SIMDe headers retain their per-file `MIT` or `CC0-1.0` SPDX notices. Full
license texts are in `parser/LICENSES/SIMDe-MIT.txt` and
`parser/LICENSES/CC0-1.0.txt`.

## Local integration and modifications

PalBeacon adds its own C ABI and CGO wrappers under `parser/internal/palooz`.
One vendored file has a narrow decode-only patch: `kraken.cpp` wraps the unused
upstream generic `Ooz_Decompress` C wrapper plus the compression declarations
and `Ooz_Compress` entry point in `#if !defined(PALBEACON_DECODE_ONLY)`. The
production binary therefore exposes only PalBeacon's bounded C ABI while the
underlying `Kraken_Decompress` decoder remains compiled. The upstream SHA-256
before that patch is
`a076a56d33be0512ee5b06fba696b5dbd8360585e9a4be204429e40a8eefcb8c`; no
decoder statement is changed.

The build defines `OOZ_BUILD_DLL=1` and `PALBEACON_DECODE_ONLY=1` and compiles
only the three decoder translation units above. No compression object,
encoder wrapper, Python binding, or save writer is compiled or linked.

## Manual update procedure

1. Review a specific upstream commit; never copy a floating branch.
2. Reconfirm `src/palsav/pyproject.toml`, `src/palsav/LICENSE`, every selected
   file's provenance, and all SIMDe SPDX headers.
3. Use the compiler dependency output for `bitknit.cpp`, `kraken.cpp`, and
   `lzna.cpp` to confirm the minimum header set.
4. Copy only those decode dependencies and the full license.
5. Recalculate every SHA-256 in this file and verify vendored bytes against
   `git show <commit>:<path>`.
6. Run the real synthetic Mermaid PlM fixture, malformed-input tests, bounded
   fuzz smoke test, reproducible double build, and `file`/`ldd` inspection.
7. Update the pinned commit and source notice only after all reviews pass.
