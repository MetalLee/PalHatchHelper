import json
import shutil
from pathlib import Path

import pytest

from pal_hatch_helper.game_catalog.hashing import compute_content_hash, sha256_bytes, sha256_file
from pal_hatch_helper.game_catalog.jsonl import (
    canonical_json,
    read_jsonl,
    write_json_atomic,
    write_jsonl_atomic,
)
from pal_hatch_helper.game_catalog.validation import FILE_SPECS, validate_catalog_directory
from pal_hatch_helper.generated import GameCatalogManifest
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


def test_application_requires_source_provenance_for_schema_1_1_0() -> None:
    from pal_hatch_helper.game_catalog.validation import (
        validate_manifest_application_requirements,
    )

    manifest = GameCatalogManifest.model_validate(
        {
            "schema_version": "1.1.0",
            "game_build_id": "fixture-server-build",
            "game_version": "fixture-version",
            "package_hash": "a" * 64,
            "content_hash": "b" * 64,
            "extractor_name": "palhatch-full-catalog-extractor",
            "extractor_version": "fixture-commit",
            "created_at": "2026-07-15T00:00:00Z",
            "locales": ["en-US"],
            "counts": {
                "pals": 1,
                "passive_skills": 1,
                "active_skills": 1,
                "pal_active_skills": 1,
                "partner_skills": 1,
                "breeding_recipes": 1,
                "localizations": 1,
            },
            "files": [{"filename": "pals.jsonl", "sha256": "c" * 64, "record_count": 1}],
            "compression": "tar.zst",
        }
    )

    with pytest.raises(StructuredError) as caught:
        validate_manifest_application_requirements(manifest)

    assert caught.value.code is ErrorCode.GAME_DATA_PROVENANCE_REQUIRED


def test_schema_1_1_0_source_evidence_keys_must_match_normalized_records(
    tmp_path: Path,
) -> None:
    fixture = Path(__file__).parents[4] / "data" / "catalog-fixtures" / "minimal-valid"
    catalog = tmp_path / "catalog"
    shutil.copytree(fixture, catalog)
    stable_id_fields = {
        "pals": "pal_id",
        "passive_skills": "passive_skill_id",
        "active_skills": "active_skill_id",
        "partner_skills": "partner_skill_id",
    }
    for spec in FILE_SPECS:
        records = list(read_jsonl(catalog / spec.filename))
        if spec.count_field != "localizations":
            for record in records:
                source_field = stable_id_fields.get(spec.count_field)
                source_name = (
                    str(record[source_field])
                    if source_field is not None
                    else ".".join(str(record[field]) for field in spec.key_fields)
                )
                metadata = record.get("metadata")
                assert isinstance(metadata, dict)
                metadata["source_internal_name"] = source_name
            write_jsonl_atomic(catalog / spec.filename, records, primary_key=spec.key_fields)
    manifest = json.loads((catalog / "manifest.json").read_text(encoding="utf-8"))
    assert isinstance(manifest, dict)
    file_hashes = [
        (
            spec.filename,
            sha256_file(catalog / spec.filename),
            len(list(read_jsonl(catalog / spec.filename))),
        )
        for spec in FILE_SPECS
    ]
    content_hash = compute_content_hash("1.1.0", file_hashes)
    source_package_manifest = {"files": [], "schema_version": "1.0.0"}
    package_hash = sha256_bytes(canonical_json(source_package_manifest).encode("utf-8"))
    manifest.update(
        {
            "schema_version": "1.1.0",
            "content_hash": content_hash,
            "package_hash": package_hash,
            "extractor_name": "palhatch-full-catalog-extractor",
            "extractor_version": "fixture-commit",
            "compression": "tar.zst",
            "source_provenance": {
                "extraction_mode": "full_game_catalog",
                "upstream_reference_repository": "tylercamp/palcalc",
                "upstream_reference_commit": "b822c7fda4f019bd7c57f45437f14a74061a29bc",
                "upstream_license": "MIT",
                "extractor_repository_commit": "fixture-commit",
                "extractor_build": "tests",
                "cue4parse_version": "1.2.2.202607",
                "source_client_app_id": "1623730",
                "source_client_build_id": "fixture-client-build",
                "source_client_appmanifest_sha256": "a" * 64,
                "source_client_game_version": manifest["game_version"],
                "target_server_app_id": "2394010",
                "target_server_build_id": manifest["game_build_id"],
                "target_server_appmanifest_sha256": "b" * 64,
                "target_server_game_version": manifest["game_version"],
                "mappings_usmap_sha256": "c" * 64,
                "source_package_manifest_sha256": package_hash,
                "extracted_at": "2026-07-15T00:00:00Z",
                "compatibility_status": "exact_game_version_match",
                "compatibility_evidence": ["client_game_version_equals_target_server_game_version"],
            },
        }
    )
    categories: dict[str, list[dict[str, object]]] = {}
    for spec in FILE_SPECS:
        entries: list[dict[str, object]] = []
        for record in read_jsonl(catalog / spec.filename):
            key_parts = []
            for field in spec.key_fields:
                value = record[field]
                key_parts.append(f"{value:020d}" if isinstance(value, int) else str(value))
            metadata = record.get("metadata")
            source_internal_name = (
                str(record["text_key"])
                if spec.count_field == "localizations"
                else str(metadata["source_internal_name"])
                if isinstance(metadata, dict)
                else ""
            )
            entries.append(
                {
                    "record_key": "\0".join(key_parts),
                    "source_internal_name": source_internal_name,
                    "sources": [
                        {
                            "asset_path": "Pal/Content/Fixture",
                            "row_name": "FixtureRow",
                            "property_chain": "Fixture.Property",
                        }
                    ],
                }
            )
        categories[spec.count_field] = entries

    write_json_atomic(catalog / "source-package-manifest.json", source_package_manifest)
    write_json_atomic(
        catalog / "source-evidence.json",
        {
            "categories": categories,
            "excluded_records": [],
            "schema_version": "1.0.0",
            "unresolved_records": [],
            "warnings": [],
        },
    )
    _refresh_catalog_integrity(catalog, manifest)

    initial_report = validate_catalog_directory(catalog)
    assert initial_report.valid, initial_report.errors

    manifest["extractor_name"] = "unreviewed-extractor"
    write_json_atomic(catalog / "manifest.json", manifest)
    report = validate_catalog_directory(catalog)
    assert not report.valid
    assert ErrorCode.GAME_DATA_PROVENANCE_REQUIRED.value in report.errors
    manifest["extractor_name"] = "palhatch-full-catalog-extractor"
    write_json_atomic(catalog / "manifest.json", manifest)

    original_record_key = categories["pals"][0]["record_key"]
    categories["pals"][0]["record_key"] = "unrelated-record"
    write_json_atomic(
        catalog / "source-evidence.json",
        {
            "categories": categories,
            "excluded_records": [],
            "schema_version": "1.0.0",
            "unresolved_records": [],
            "warnings": [],
        },
    )

    report = validate_catalog_directory(catalog)
    assert not report.valid
    assert "CATALOG_SOURCE_EVIDENCE_INVALID" in report.errors

    categories["pals"][0]["record_key"] = original_record_key
    write_json_atomic(
        catalog / "source-evidence.json",
        {
            "categories": categories,
            "excluded_records": [],
            "schema_version": "1.0.0",
            "unresolved_records": [],
            "warnings": [],
        },
    )
    pals = list(read_jsonl(catalog / "pals.jsonl"))
    pals[0]["metadata"] = {}
    write_jsonl_atomic(catalog / "pals.jsonl", pals, primary_key="pal_id")
    _refresh_catalog_integrity(catalog, manifest)

    report = validate_catalog_directory(catalog)
    assert not report.valid
    assert "CATALOG_SOURCE_EVIDENCE_INVALID" in report.errors


def _refresh_catalog_integrity(catalog: Path, manifest: dict[str, object]) -> None:
    file_hashes = [
        (
            spec.filename,
            sha256_file(catalog / spec.filename),
            len(list(read_jsonl(catalog / spec.filename))),
        )
        for spec in FILE_SPECS
    ]
    content_hash = compute_content_hash("1.1.0", file_hashes)
    manifest["content_hash"] = content_hash
    manifest["files"] = [
        {"filename": filename, "sha256": sha256, "record_count": count}
        for filename, sha256, count in sorted(file_hashes)
    ]
    write_json_atomic(catalog / "manifest.json", manifest)
    write_json_atomic(
        catalog / "validation-report.json",
        {
            "schema_version": "1.1.0",
            "content_hash": content_hash,
            "valid": True,
            "errors": [],
            "warnings": [],
            "counts": manifest["counts"],
        },
    )
    (catalog / "checksums.sha256").write_text(
        "".join(f"{sha256}  {filename}\n" for filename, sha256, _ in sorted(file_hashes)),
        encoding="utf-8",
    )
