import json
from pathlib import Path

import pytest

from pal_hatch_helper.game_catalog.hashing import compute_content_hash
from pal_hatch_helper.game_catalog.jsonl import read_jsonl, write_jsonl_atomic
from pal_hatch_helper.game_catalog.validation import validate_catalog_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


def test_jsonl_writer_is_canonical_and_hash_ignores_file_order_and_mtime(tmp_path: Path) -> None:
    first = tmp_path / "first.jsonl"
    second = tmp_path / "second.jsonl"
    records = [
        {"pal_id": "fixture-pal-b", "element_types": ["water", "fire"]},
        {"pal_id": "fixture-pal-a", "element_types": ["fire"]},
    ]

    write_jsonl_atomic(first, records, primary_key="pal_id", set_fields={"element_types"})
    write_jsonl_atomic(
        second,
        reversed(records),
        primary_key="pal_id",
        set_fields={"element_types"},
    )

    assert first.read_bytes() == second.read_bytes()
    assert first.read_bytes().endswith(b"\n")
    assert next(iter(read_jsonl(first)))["pal_id"] == "fixture-pal-a"

    files_a = [("z.jsonl", "a" * 64, 1), ("a.jsonl", "b" * 64, 2)]
    files_b = list(reversed(files_a))
    assert compute_content_hash("1.0.0", files_a) == compute_content_hash("1.0.0", files_b)

    first.touch()
    assert compute_content_hash("1.0.0", files_a) == compute_content_hash("1.0.0", files_b)


def test_jsonl_reader_rejects_invalid_json(tmp_path: Path) -> None:
    path = tmp_path / "invalid.jsonl"
    path.write_text("{broken}\n", encoding="utf-8")

    with pytest.raises(StructuredError) as caught:
        list(read_jsonl(path))

    assert caught.value.code is ErrorCode.GAME_DATA_JSON_INVALID


def test_validation_rejects_duplicate_ids_and_broken_references(tmp_path: Path) -> None:
    fixture = tmp_path / "catalog"
    fixture.mkdir()
    (fixture / "pals.jsonl").write_text(
        '{"breeding_power":10,"element_types":["fire"],"encyclopedia_no":1,'
        '"metadata":{},"name_key":"pal.a","pal_id":"fixture-pal-a","rarity":1}\n'
        '{"breeding_power":10,"element_types":["fire"],"encyclopedia_no":2,'
        '"metadata":{},"name_key":"pal.a","pal_id":"fixture-pal-a","rarity":1}\n',
        encoding="utf-8",
    )

    report = validate_catalog_directory(fixture, require_manifest=False)

    assert not report.valid
    assert "CATALOG_DUPLICATE_ID" in report.errors
    assert json.loads(report.model_dump_json())["valid"] is False
