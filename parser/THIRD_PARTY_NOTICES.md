# Third-party notices

## 8tp/palhelm save parser

Files under `internal/sav` marked with a modification notice are derived from
the decode-only save parser in
[8tp/palhelm](https://github.com/8tp/palhelm), pinned to commit
`e099e8afe4823d6cf6b371e5e3938955e5a1becd`. Palhelm is licensed under
Apache License 2.0; the full license is in `LICENSES/Apache-2.0.txt`.

PalHatchHelper removed Palhelm's Oodle download behavior, added mandatory
SHA-256 verification, added CanonicalSnapshot projection and stable-ID
normalization, made declared player-file parse failures fail closed, and does
not include any save encoder or write-back path.

## golang.org/x/text

The vendored Unicode normalization code under `vendor/golang.org/x/text` is
Copyright 2009 The Go Authors and uses the BSD 3-Clause license reproduced in
`vendor/golang.org/x/text/LICENSE`. It is used only to implement the shared
`palworld-stable-id-v1` NFKC mapping.

## Oodle

Oodle is proprietary software and is not part of this repository, vendored
source, executable bundle, or Agent image. Operators must supply a legally
obtained `liboo2corelinux64.so.9` separately and pin its SHA-256.
