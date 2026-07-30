import os
import tempfile
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from pal_hatch_helper.game_catalog.artifacts import CatalogArtifactStore, create_catalog_bundle
from pal_hatch_helper.game_catalog.gateway import CatalogImportGateway
from pal_hatch_helper.game_catalog.hashing import compute_content_hash, sha256_file
from pal_hatch_helper.game_catalog.jsonl import (
    JSONRecord,
    read_jsonl,
    write_json_atomic,
    write_jsonl_atomic,
)
from pal_hatch_helper.game_catalog.paths import CatalogPaths, fsync_directory
from pal_hatch_helper.game_catalog.validation import (
    LEGACY_FILE_SPECS,
    file_specs_for_schema,
    load_catalog_directory,
)
from pal_hatch_helper.generated import (
    BreedingSourceProvenance,
    CatalogCounts,
    CatalogFileChecksum,
    CatalogValidationReport,
    GameCatalogManifest,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

LEGACY_NORMALIZATION_EXCLUDED_FIELDS: dict[str, set[str]] = {
    "passive_skills": {"description_template_key", "effects"},
}


async def stage_catalog_version(
    directory: Path,
    *,
    source_id: UUID | None,
    artifact_bucket: str,
    artifact_store: CatalogArtifactStore,
    gateway: CatalogImportGateway,
    batch_size: int = 500,
) -> UUID:
    catalog = load_catalog_directory(directory)
    bundle = create_catalog_bundle(directory)
    await artifact_store.put_version_metadata(
        catalog.content_hash,
        (directory / "manifest.json").read_bytes(),
        (directory / "validation-report.json").read_bytes(),
    )
    await artifact_store.put_version_bundle(catalog.content_hash, bundle)
    version_id, import_run_id = await gateway.begin_import(
        source_id=source_id,
        manifest=catalog.manifest,
        artifact_bucket=artifact_bucket,
        artifact_path=f"versions/{catalog.content_hash}/catalog.tar.gz",
    )
    for spec in file_specs_for_schema(catalog.schema_version):
        records = list(read_jsonl(directory / spec.filename))
        for batch_index, batch in enumerate(_batches(records, batch_size)):
            await gateway.stage_batch(
                import_run_id=import_run_id,
                entity_type=spec.count_field,
                idempotency_key=f"{spec.count_field}:{batch_index}",
                records=batch,
            )
    finalized_id = await gateway.finalize_import(import_run_id)
    if finalized_id != version_id:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_IMPORT_REJECTED,
            summary="Catalog finalize returned a different version identifier.",
            retryable=False,
        )
    return version_id


def prepare_normalized_catalog(
    input_directory: Path,
    *,
    paths: CatalogPaths,
    game_build_id: str,
    game_version: str,
    package_hash: str,
    extractor_name: str,
    extractor_version: str,
    breeding_source_provenance: BreedingSourceProvenance | None = None,
    created_at: datetime | None = None,
) -> Path:
    """Normalize structured extractor output without parsing any game package."""

    paths.ensure()
    temporary = Path(tempfile.mkdtemp(prefix=".normalize.", dir=paths.normalized))
    try:
        file_checksums: list[CatalogFileChecksum] = []
        counts_by_field: dict[str, int] = {}
        locales: set[str] = set()
        for spec in LEGACY_FILE_SPECS:
            records = list(read_jsonl(input_directory / spec.filename, require_canonical=False))
            validated = [
                spec.model.model_validate(record).model_dump(
                    mode="json",
                    exclude=LEGACY_NORMALIZATION_EXCLUDED_FIELDS.get(spec.count_field),
                )
                for record in records
            ]
            if spec.count_field == "localizations":
                locales.update(str(record["locale"]) for record in validated)
            count = write_jsonl_atomic(
                temporary / spec.filename,
                validated,
                primary_key=spec.key_fields,
                set_fields={"element_types"},
            )
            counts_by_field[spec.count_field] = count
            file_checksums.append(
                CatalogFileChecksum(
                    filename=spec.filename,
                    sha256=sha256_file(temporary / spec.filename),
                    record_count=count,
                )
            )
        counts = CatalogCounts.model_validate(counts_by_field)
        content_hash = compute_content_hash(
            "1.0.0",
            ((item.filename, item.sha256, item.record_count) for item in file_checksums),
        )
        manifest = GameCatalogManifest(
            schema_version="1.0.0",
            game_build_id=game_build_id,
            game_version=game_version,
            package_hash=package_hash,
            content_hash=content_hash,
            extractor_name=extractor_name,
            extractor_version=extractor_version,
            created_at=created_at or datetime.now(UTC),
            locales=sorted(locales),
            counts=counts,
            files=sorted(file_checksums, key=lambda item: item.filename),
            compression="tar.gz",
            breeding_source_provenance=breeding_source_provenance,
        )
        report = CatalogValidationReport(
            schema_version="1.0.0",
            content_hash=content_hash,
            valid=True,
            errors=[],
            warnings=[],
            counts=counts,
        )
        write_json_atomic(temporary / "manifest.json", manifest.model_dump(mode="json"))
        write_json_atomic(temporary / "validation-report.json", report.model_dump(mode="json"))
        _write_checksums(temporary / "checksums.sha256", file_checksums)
        load_catalog_directory(temporary)
        destination = paths.normalized / content_hash
        if destination.exists():
            existing = load_catalog_directory(destination)
            if existing.content_hash != content_hash:
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_HASH_MISMATCH,
                    summary="An immutable normalized version already has different content.",
                    retryable=False,
                )
            return destination
        os.replace(temporary, destination)
        fsync_directory(destination.parent)
        return destination
    finally:
        if temporary.exists():
            for child in temporary.iterdir():
                child.unlink(missing_ok=True)
            temporary.rmdir()


def _batches(records: Sequence[JSONRecord], size: int) -> list[list[JSONRecord]]:
    if size <= 0:
        raise ValueError("batch size must be positive")
    return [list(records[index : index + size]) for index in range(0, len(records), size)]


def _write_checksums(path: Path, checksums: list[CatalogFileChecksum]) -> None:
    payload = "".join(
        f"{item.sha256}  {item.filename}\n"
        for item in sorted(checksums, key=lambda item: item.filename)
    )
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=".checksums.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as output:
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        fsync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


__all__ = ["prepare_normalized_catalog", "stage_catalog_version"]
