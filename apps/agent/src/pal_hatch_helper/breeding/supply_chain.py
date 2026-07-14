import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from pal_hatch_helper.breeding.data_sources import StagedBreedingSource
from pal_hatch_helper.breeding.pipeline import transform_and_validate_recipes
from pal_hatch_helper.game_catalog.importer import prepare_normalized_catalog
from pal_hatch_helper.game_catalog.jsonl import write_json_atomic, write_jsonl_atomic
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.validation import FILE_SPECS, load_catalog_directory
from pal_hatch_helper.generated import BreedingDataValidationReport
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


@dataclass(frozen=True, slots=True)
class PreparedBreedingCatalogVersion:
    normalized_directory: Path
    validation_report: BreedingDataValidationReport


def prepare_breeding_catalog_version(
    staged: StagedBreedingSource,
    *,
    base_catalog_directory: Path,
    paths: CatalogPaths,
    extractor_name: str = "breeding-source-transformer",
    extractor_version: str = "1.0.0",
    created_at: datetime | None = None,
) -> PreparedBreedingCatalogVersion:
    """Build a local immutable candidate; publication remains an explicit admin action."""

    base = load_catalog_directory(base_catalog_directory)
    result = transform_and_validate_recipes(
        staged.content_path.read_bytes(),
        known_pal_ids=frozenset(item.pal_id for item in base.pals),
        raw_content_hash=staged.raw_content_hash,
        source_version=staged.source_version,
    )
    write_json_atomic(
        staged.directory / "breeding-validation-report.json",
        result.report.model_dump(mode="json"),
    )
    if not result.report.valid:
        raise StructuredError(
            code=ErrorCode.BREEDING_DATA_VALIDATION_FAILED,
            summary="The staged breeding data failed validation and was not versioned.",
            retryable=False,
        )

    paths.ensure()
    candidate = Path(tempfile.mkdtemp(prefix=".breeding-candidate-", dir=paths.extraction_staging))
    try:
        for spec in FILE_SPECS:
            if spec.count_field != "breeding_recipes":
                shutil.copyfile(base_catalog_directory / spec.filename, candidate / spec.filename)
        write_jsonl_atomic(
            candidate / "breeding-recipes.jsonl",
            (recipe.model_dump(mode="json") for recipe in result.recipes),
            primary_key=("parent_a_pal_id", "parent_b_pal_id", "recipe_type"),
        )
        normalized = prepare_normalized_catalog(
            candidate,
            paths=paths,
            game_build_id=base.manifest.game_build_id,
            game_version=staged.source_version,
            package_hash=staged.raw_content_hash,
            extractor_name=extractor_name,
            extractor_version=extractor_version,
            created_at=created_at,
        )
        return PreparedBreedingCatalogVersion(
            normalized_directory=normalized,
            validation_report=result.report,
        )
    finally:
        shutil.rmtree(candidate, ignore_errors=True)
