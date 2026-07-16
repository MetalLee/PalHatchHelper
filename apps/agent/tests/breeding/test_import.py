import asyncio
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest

from pal_hatch_helper.breeding.data_sources import (
    UploadDataSourceAdapter,
    UploadSourceConfig,
    stage_breeding_source,
)
from pal_hatch_helper.breeding.diff import build_breeding_data_diff
from pal_hatch_helper.breeding.pipeline import (
    BreedingRecipeValidationResult,
    transform_and_validate_recipes,
)
from pal_hatch_helper.breeding.recipes import resolve_breeding_child
from pal_hatch_helper.breeding.supply_chain import prepare_breeding_catalog_version
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.validation import load_catalog_directory
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

FIXTURE_ROOT = Path(__file__).parents[4] / "data" / "breeding-fixtures"
SOURCE_ID = UUID("74000000-0000-4000-8000-000000000003")
KNOWN_PAL_IDS = frozenset(
    {
        "fixture-pal-a",
        "fixture-pal-b",
        "fixture-pal-c",
        "fixture-pal-d",
        "fixture-pal-e",
        "fixture-pal-f",
    }
)


def _validate_fixture(name: str) -> BreedingRecipeValidationResult:
    content = (FIXTURE_ROOT / name).read_bytes()
    return transform_and_validate_recipes(
        content,
        known_pal_ids=KNOWN_PAL_IDS,
        raw_content_hash=hashlib.sha256(content).hexdigest(),
        source_version=name.removesuffix(".json"),
        base_content_hash="e" * 64,
        game_build_id="fixture-build",
        game_version="fixture-version",
    )


def test_repository_regression_fixture_normalizes_parents_and_prefers_special_recipe() -> None:
    result = _validate_fixture("fixture-v1.json")

    assert result.report.valid
    assert result.report.counts.input_records == 4
    assert result.report.counts.normalized_records == 4
    assert result.report.counts.special_overrides == 1
    assert [(item.parent_a_pal_id, item.parent_b_pal_id) for item in result.recipes] == [
        ("fixture-pal-a", "fixture-pal-b"),
        ("fixture-pal-a", "fixture-pal-b"),
        ("fixture-pal-a", "fixture-pal-c"),
        ("fixture-pal-d", "fixture-pal-e"),
    ]
    assert all(
        item.parent_a_gender == "any" and item.parent_b_gender == "any" for item in result.recipes
    )
    assert (
        resolve_breeding_child(result.recipes, "fixture-pal-b", "fixture-pal-a") == "fixture-pal-d"
    )


def test_validation_rejects_schema_unknown_ids_duplicates_conflicts_and_contradictions() -> None:
    result = _validate_fixture("invalid-recipes.json")

    assert not result.report.valid
    assert {issue.code for issue in result.report.errors} == {
        "BREEDING_PAL_ID_UNKNOWN",
        "BREEDING_RECIPE_CONFLICT",
        "BREEDING_RECIPE_DUPLICATE",
        "BREEDING_RECIPE_SCHEMA_INVALID",
        "BREEDING_RECIPE_TYPE_CONTRADICTION",
    }


def test_diff_report_is_stable_and_separates_added_removed_and_changed_recipes() -> None:
    before = _validate_fixture("fixture-v1.json")
    after = _validate_fixture("fixture-v2.json")

    report = build_breeding_data_diff(
        before.recipes,
        after.recipes,
        from_content_hash=before.report.raw_content_hash,
        to_content_hash=after.report.raw_content_hash,
    )

    assert report.counts.added == 1
    assert report.counts.removed == 1
    assert report.counts.changed == 1
    assert report.changed[0].before_child_pal_id == "fixture-pal-c"
    assert report.changed[0].after_child_pal_id == "fixture-pal-f"
    assert (
        report.model_dump_json()
        == build_breeding_data_diff(
            tuple(reversed(before.recipes)),
            tuple(reversed(after.recipes)),
            from_content_hash=before.report.raw_content_hash,
            to_content_hash=after.report.raw_content_hash,
        ).model_dump_json()
    )


def test_validated_source_builds_an_unpublished_local_version_with_source_provenance(
    tmp_path: Path,
) -> None:
    content = (FIXTURE_ROOT / "catalog-merge.json").read_bytes()
    base_catalog = FIXTURE_ROOT.parent / "catalog-fixtures" / "minimal-valid"

    async def scenario() -> None:
        paths = CatalogPaths(tmp_path)
        staged = await stage_breeding_source(
            UploadDataSourceAdapter(
                UploadSourceConfig(
                    name="fixture-upload",
                    filename="catalog-merge.json",
                    source_version="fixture-merge-v1",
                ),
                content,
            ),
            paths=paths,
            source_id=SOURCE_ID,
        )
        prepared = prepare_breeding_catalog_version(
            staged,
            base_catalog_directory=base_catalog,
            paths=paths,
            created_at=datetime(2026, 7, 14, tzinfo=UTC),
        )
        catalog = load_catalog_directory(prepared.normalized_directory)

        assert prepared.validation_report.valid
        base = load_catalog_directory(base_catalog)
        assert catalog.manifest.package_hash == base.manifest.package_hash
        assert catalog.manifest.game_version == base.manifest.game_version
        assert catalog.manifest.game_build_id == base.manifest.game_build_id
        assert catalog.manifest.breeding_source_provenance is not None
        assert catalog.manifest.breeding_source_provenance.source_id == SOURCE_ID
        assert (
            catalog.manifest.breeding_source_provenance.raw_content_hash == staged.raw_content_hash
        )
        assert len(catalog.breeding_recipes) == 2
        assert not hasattr(prepared, "published_version_id")

    asyncio.run(scenario())


def test_source_targeting_a_different_base_catalog_is_rejected(tmp_path: Path) -> None:
    original = json.loads((FIXTURE_ROOT / "catalog-merge.json").read_text(encoding="utf-8"))
    original["base_content_hash"] = "0" * 64
    content = json.dumps(original, sort_keys=True, separators=(",", ":")).encode()
    base_catalog = FIXTURE_ROOT.parent / "catalog-fixtures" / "minimal-valid"

    async def scenario() -> None:
        paths = CatalogPaths(tmp_path)
        staged = await stage_breeding_source(
            UploadDataSourceAdapter(
                UploadSourceConfig(
                    name="fixture-upload",
                    filename="catalog-merge.json",
                    source_version="fixture-merge-v1",
                ),
                content,
            ),
            paths=paths,
            source_id=SOURCE_ID,
        )
        with pytest.raises(StructuredError) as caught:
            prepare_breeding_catalog_version(
                staged,
                base_catalog_directory=base_catalog,
                paths=paths,
            )

        assert caught.value.code is ErrorCode.BREEDING_BASE_CATALOG_MISMATCH

    asyncio.run(scenario())
