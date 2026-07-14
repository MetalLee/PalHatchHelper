# Redacted parser fixture

This directory contains fully synthetic identities and inventory values created for the
Phase 3 ParserAdapter contract test. It contains no bytes copied from a real Palworld save
and no production path, credential, player name, or server identifier.

The `.sav` suffix models the ParserAdapter file declaration. The fixture payload itself is
a small deterministic JSON compatibility format consumed only by
`tests/parsers/redacted_fixture_command.py`; it does not claim compatibility with the
Palworld binary save format. Production compatibility remains the responsibility of the
explicitly configured, independently sandboxed parser command.
