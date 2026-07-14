import hashlib
from collections.abc import Iterator
from pathlib import Path

import pytest

PARSER_FIXTURES = Path(__file__).parents[3] / "data" / "parser-fixtures"


def _fixture_evidence() -> dict[str, tuple[str | None, int]]:
    evidence: dict[str, tuple[str | None, int]] = {}
    for path in [PARSER_FIXTURES, *sorted(PARSER_FIXTURES.rglob("*"))]:
        content_hash = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
        evidence[path.relative_to(PARSER_FIXTURES).as_posix() or "."] = (
            content_hash,
            path.stat().st_mode & 0o777,
        )
    return evidence


@pytest.fixture(scope="session", autouse=True)
def prove_parser_fixtures_are_read_only() -> Iterator[None]:
    before = _fixture_evidence()
    yield
    assert _fixture_evidence() == before
