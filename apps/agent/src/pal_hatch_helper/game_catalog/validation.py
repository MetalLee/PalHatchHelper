import json
from dataclasses import dataclass
from pathlib import Path
from typing import TypeGuard

from pydantic import BaseModel, ValidationError

from pal_hatch_helper.game_catalog.hashing import compute_content_hash, sha256_bytes, sha256_file
from pal_hatch_helper.game_catalog.jsonl import canonical_json, read_jsonl
from pal_hatch_helper.game_catalog.models import LoadedGameCatalog
from pal_hatch_helper.generated import (
    CatalogActiveSkill,
    CatalogBreedingRecipe,
    CatalogCounts,
    CatalogFileChecksum,
    CatalogLocalization,
    CatalogPal,
    CatalogPalActiveSkill,
    CatalogPartnerSkill,
    CatalogPassiveSkill,
    CatalogValidationReport,
    GameCatalogManifest,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

SUPPORTED_SCHEMA_VERSIONS = frozenset({"1.0.0", "1.1.0"})


@dataclass(frozen=True, slots=True)
class FileSpec:
    filename: str
    count_field: str
    model: type[BaseModel]
    key_fields: tuple[str, ...]


FILE_SPECS = (
    FileSpec("pals.jsonl", "pals", CatalogPal, ("pal_id",)),
    FileSpec(
        "passive-skills.jsonl",
        "passive_skills",
        CatalogPassiveSkill,
        ("passive_skill_id",),
    ),
    FileSpec("active-skills.jsonl", "active_skills", CatalogActiveSkill, ("active_skill_id",)),
    FileSpec(
        "pal-active-skills.jsonl",
        "pal_active_skills",
        CatalogPalActiveSkill,
        ("pal_id", "active_skill_id", "learn_level"),
    ),
    FileSpec(
        "partner-skills.jsonl",
        "partner_skills",
        CatalogPartnerSkill,
        ("partner_skill_id",),
    ),
    FileSpec(
        "breeding-recipes.jsonl",
        "breeding_recipes",
        CatalogBreedingRecipe,
        ("parent_a_pal_id", "parent_b_pal_id", "recipe_type"),
    ),
    FileSpec(
        "localizations.jsonl",
        "localizations",
        CatalogLocalization,
        ("locale", "text_key"),
    ),
)

REQUIRED_PACKAGE_FILES = tuple(spec.filename for spec in FILE_SPECS)


def validate_catalog_directory(
    directory: Path,
    *,
    require_manifest: bool = True,
) -> CatalogValidationReport:
    errors: set[str] = set()
    warnings: set[str] = set()
    parsed: dict[str, list[BaseModel]] = {}
    counts = _empty_counts()
    checksums: list[CatalogFileChecksum] = []

    for spec in FILE_SPECS:
        path = directory / spec.filename
        if not path.is_file():
            errors.add("CATALOG_FILE_MISSING")
            parsed[spec.count_field] = []
            continue
        models: list[BaseModel] = []
        seen_keys: set[tuple[str, ...]] = set()
        previous_key: tuple[str, ...] | None = None
        try:
            for record in read_jsonl(path):
                try:
                    model = spec.model.model_validate(record)
                except ValidationError:
                    errors.add("CATALOG_SCHEMA_INVALID")
                    continue
                key = tuple(str(getattr(model, field)) for field in spec.key_fields)
                if key in seen_keys:
                    errors.add("CATALOG_DUPLICATE_ID")
                if previous_key is not None and key < previous_key:
                    errors.add("CATALOG_ORDER_INVALID")
                seen_keys.add(key)
                previous_key = key
                models.append(model)
        except StructuredError as error:
            errors.add(error.code.value)
        parsed[spec.count_field] = models
        setattr(counts, spec.count_field, len(models))
        checksums.append(
            CatalogFileChecksum(
                filename=spec.filename,
                sha256=sha256_file(path),
                record_count=len(models),
            )
        )

    _validate_relationships(parsed, errors)
    manifest = _read_manifest(directory, errors) if require_manifest else None
    content_hash: str | None = None
    if len(checksums) == len(FILE_SPECS):
        content_hash = compute_content_hash(
            manifest.schema_version if manifest is not None else "1.0.0",
            ((item.filename, item.sha256, item.record_count) for item in checksums),
        )
    if manifest is not None:
        try:
            validate_manifest_application_requirements(manifest)
        except StructuredError as error:
            errors.add(error.code.value)
        localization_locales = {
            record.locale for record in _typed(parsed.get("localizations", []), CatalogLocalization)
        }
        _validate_manifest(
            manifest,
            counts,
            checksums,
            content_hash,
            localization_locales,
            errors,
        )
        _validate_sidecars(directory, counts, checksums, content_hash, errors)
        _validate_full_catalog_sidecars(directory, manifest, parsed, errors)

    return CatalogValidationReport(
        schema_version=manifest.schema_version if manifest is not None else "1.0.0",
        content_hash=content_hash,
        valid=not errors,
        errors=sorted(errors),
        warnings=sorted(warnings),
        counts=counts,
    )


def load_catalog_directory(directory: Path) -> LoadedGameCatalog:
    report = validate_catalog_directory(directory)
    if not report.valid:
        code = (
            ErrorCode.GAME_DATA_HASH_MISMATCH
            if "GAME_DATA_HASH_MISMATCH" in report.errors
            else ErrorCode.GAME_DATA_VALIDATION_FAILED
        )
        raise StructuredError(
            code=code,
            summary="The requested game catalog version failed validation.",
            retryable=False,
        )
    manifest = GameCatalogManifest.model_validate_json(
        (directory / "manifest.json").read_text(encoding="utf-8")
    )
    validate_manifest_application_requirements(manifest)
    if manifest.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_SCHEMA_UNSUPPORTED,
            summary="The requested game catalog schema version is not supported.",
            retryable=False,
        )
    records = {
        spec.count_field: [
            spec.model.model_validate(item) for item in read_jsonl(directory / spec.filename)
        ]
        for spec in FILE_SPECS
    }
    return LoadedGameCatalog(
        manifest=manifest,
        pals=tuple(_typed(records["pals"], CatalogPal)),
        passive_skills=tuple(_typed(records["passive_skills"], CatalogPassiveSkill)),
        active_skills=tuple(_typed(records["active_skills"], CatalogActiveSkill)),
        pal_active_skills=tuple(_typed(records["pal_active_skills"], CatalogPalActiveSkill)),
        partner_skills=tuple(_typed(records["partner_skills"], CatalogPartnerSkill)),
        breeding_recipes=tuple(_typed(records["breeding_recipes"], CatalogBreedingRecipe)),
        localizations=tuple(_typed(records["localizations"], CatalogLocalization)),
    )


def validate_manifest_application_requirements(manifest: GameCatalogManifest) -> None:
    if manifest.schema_version != "1.1.0":
        return
    provenance = manifest.source_provenance
    if provenance is None:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_PROVENANCE_REQUIRED,
            summary="Catalog schema 1.1.0 requires full source provenance.",
            retryable=False,
        )
    if (
        provenance.compatibility_status != "exact_game_version_match"
        or provenance.source_client_game_version != provenance.target_server_game_version
        or provenance.target_server_build_id != manifest.game_build_id
        or provenance.target_server_game_version != manifest.game_version
        or provenance.source_package_manifest_sha256 != manifest.package_hash
    ):
        raise StructuredError(
            code=ErrorCode.GAME_DATA_PROVENANCE_REQUIRED,
            summary="Catalog source provenance is not compatible with the target server facts.",
            retryable=False,
        )
    if any(
        getattr(manifest.counts, field) <= 0
        for field in (
            "pals",
            "passive_skills",
            "active_skills",
            "pal_active_skills",
            "partner_skills",
            "breeding_recipes",
            "localizations",
        )
    ):
        raise StructuredError(
            code=ErrorCode.GAME_DATA_VALIDATION_FAILED,
            summary="A full catalog requires all seven categories to be non-empty.",
            retryable=False,
        )


def _typed[T: BaseModel](records: list[BaseModel], model: type[T]) -> list[T]:
    return [model.model_validate(record.model_dump()) for record in records]


def _empty_counts() -> CatalogCounts:
    return CatalogCounts(
        pals=0,
        passive_skills=0,
        active_skills=0,
        pal_active_skills=0,
        partner_skills=0,
        breeding_recipes=0,
        localizations=0,
    )


def _read_manifest(directory: Path, errors: set[str]) -> GameCatalogManifest | None:
    path = directory / "manifest.json"
    if not path.is_file():
        errors.add("CATALOG_MANIFEST_MISSING")
        return None
    try:
        manifest = GameCatalogManifest.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValidationError, json.JSONDecodeError):
        errors.add("CATALOG_MANIFEST_INVALID")
        return None
    if manifest.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        errors.add(ErrorCode.GAME_DATA_SCHEMA_UNSUPPORTED.value)
    return manifest


def _validate_manifest(
    manifest: GameCatalogManifest,
    counts: CatalogCounts,
    checksums: list[CatalogFileChecksum],
    content_hash: str | None,
    localization_locales: set[str],
    errors: set[str],
) -> None:
    expected_files = {item.filename: item for item in manifest.files}
    actual_files = {item.filename: item for item in checksums}
    if set(expected_files) != set(REQUIRED_PACKAGE_FILES):
        errors.add("CATALOG_MANIFEST_FILE_SET_INVALID")
    for filename, actual in actual_files.items():
        expected = expected_files.get(filename)
        if expected is None:
            continue
        if expected.record_count != actual.record_count:
            errors.add("CATALOG_MANIFEST_COUNT_MISMATCH")
        if expected.sha256 != actual.sha256:
            errors.add(ErrorCode.GAME_DATA_HASH_MISMATCH.value)
    if manifest.counts != counts:
        errors.add("CATALOG_MANIFEST_COUNT_MISMATCH")
    if content_hash is not None and manifest.content_hash != content_hash:
        errors.add(ErrorCode.GAME_DATA_HASH_MISMATCH.value)
    if set(manifest.locales) != localization_locales:
        errors.add("CATALOG_MANIFEST_LOCALE_MISMATCH")


def _validate_sidecars(
    directory: Path,
    counts: CatalogCounts,
    checksums: list[CatalogFileChecksum],
    content_hash: str | None,
    errors: set[str],
) -> None:
    report_path = directory / "validation-report.json"
    checksum_path = directory / "checksums.sha256"
    if not report_path.is_file() or not checksum_path.is_file():
        errors.add("CATALOG_SIDECAR_MISSING")
        return
    try:
        report = CatalogValidationReport.model_validate_json(
            report_path.read_text(encoding="utf-8")
        )
    except (OSError, UnicodeDecodeError, ValidationError):
        errors.add("CATALOG_VALIDATION_REPORT_INVALID")
    else:
        if (
            not report.valid
            or report.errors
            or report.counts != counts
            or report.content_hash != content_hash
        ):
            errors.add("CATALOG_VALIDATION_REPORT_MISMATCH")
    expected_checksums = "".join(
        f"{item.sha256}  {item.filename}\n"
        for item in sorted(checksums, key=lambda item: item.filename)
    )
    try:
        actual_checksums = checksum_path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        errors.add("CATALOG_CHECKSUM_FILE_INVALID")
    else:
        if actual_checksums != expected_checksums:
            errors.add(ErrorCode.GAME_DATA_HASH_MISMATCH.value)


def _validate_full_catalog_sidecars(
    directory: Path,
    manifest: GameCatalogManifest,
    parsed: dict[str, list[BaseModel]],
    errors: set[str],
) -> None:
    if manifest.schema_version != "1.1.0":
        return
    source_manifest_path = directory / "source-package-manifest.json"
    source_evidence_path = directory / "source-evidence.json"
    if not source_manifest_path.is_file() or not source_evidence_path.is_file():
        errors.add("CATALOG_SIDECAR_MISSING")
        return
    try:
        source_manifest = json.loads(source_manifest_path.read_text(encoding="utf-8"))
        if not isinstance(source_manifest, dict):
            raise ValueError
        package_hash = sha256_bytes(canonical_json(source_manifest).encode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        errors.add("CATALOG_SOURCE_PACKAGE_MANIFEST_INVALID")
    else:
        if package_hash != manifest.package_hash:
            errors.add(ErrorCode.GAME_DATA_HASH_MISMATCH.value)
    try:
        source_evidence = json.loads(source_evidence_path.read_text(encoding="utf-8"))
        categories = source_evidence["categories"]
        if (
            not isinstance(categories, dict)
            or set(categories) != {spec.count_field for spec in FILE_SPECS}
            or source_evidence.get("unresolved_records") != []
        ):
            raise ValueError
        for spec in FILE_SPECS:
            entries = categories.get(spec.count_field)
            expected_keys = {
                _source_evidence_record_key(record, spec.key_fields)
                for record in parsed.get(spec.count_field, [])
            }
            if not isinstance(entries, list) or len(entries) != len(expected_keys):
                raise ValueError
            actual_keys: set[str] = set()
            for entry in entries:
                if not isinstance(entry, dict):
                    raise ValueError
                record_key = entry.get("record_key")
                source_internal_name = entry.get("source_internal_name")
                sources = entry.get("sources")
                if (
                    not _non_empty_text(record_key)
                    or not _non_empty_text(source_internal_name)
                    or not isinstance(sources, list)
                    or not sources
                    or not all(_valid_source_location(source) for source in sources)
                    or record_key in actual_keys
                ):
                    raise ValueError
                actual_keys.add(record_key)
            if actual_keys != expected_keys:
                raise ValueError
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, KeyError, TypeError, ValueError):
        errors.add("CATALOG_SOURCE_EVIDENCE_INVALID")


def _source_evidence_record_key(record: BaseModel, fields: tuple[str, ...]) -> str:
    parts: list[str] = []
    for field in fields:
        value = getattr(record, field)
        parts.append(f"{value:020d}" if isinstance(value, int) else str(value))
    return "\0".join(parts)


def _valid_source_location(value: object) -> bool:
    return isinstance(value, dict) and all(
        _non_empty_text(value.get(field)) for field in ("asset_path", "row_name", "property_chain")
    )


def _non_empty_text(value: object) -> TypeGuard[str]:
    return isinstance(value, str) and bool(value.strip())


def _validate_relationships(parsed: dict[str, list[BaseModel]], errors: set[str]) -> None:
    pals = _typed(parsed.get("pals", []), CatalogPal)
    passive_skills = _typed(parsed.get("passive_skills", []), CatalogPassiveSkill)
    active_skills = _typed(parsed.get("active_skills", []), CatalogActiveSkill)
    pal_active_skills = _typed(parsed.get("pal_active_skills", []), CatalogPalActiveSkill)
    partner_skills = _typed(parsed.get("partner_skills", []), CatalogPartnerSkill)
    recipes = _typed(parsed.get("breeding_recipes", []), CatalogBreedingRecipe)
    localizations = _typed(parsed.get("localizations", []), CatalogLocalization)

    pal_ids = {record.pal_id for record in pals}
    active_ids = {record.active_skill_id for record in active_skills}
    localization_keys = {record.text_key for record in localizations}
    required_keys = {record.name_key for record in pals}
    required_keys.update(record.name_key for record in passive_skills)
    required_keys.update(record.name_key for record in active_skills)
    required_keys.update(record.name_key for record in partner_skills)
    required_keys.update(
        record.description_key for record in passive_skills if record.description_key is not None
    )
    required_keys.update(
        record.description_key for record in partner_skills if record.description_key is not None
    )
    if required_keys - localization_keys:
        errors.add("CATALOG_LOCALIZATION_REFERENCE_INVALID")

    if any(
        relation.pal_id not in pal_ids or relation.active_skill_id not in active_ids
        for relation in pal_active_skills
    ):
        errors.add("CATALOG_REFERENCE_INVALID")
    if any(skill.pal_id not in pal_ids for skill in partner_skills):
        errors.add("CATALOG_REFERENCE_INVALID")

    recipe_keys: dict[tuple[str, str, str], str] = {}
    for recipe in recipes:
        if (
            recipe.parent_a_pal_id not in pal_ids
            or recipe.parent_b_pal_id not in pal_ids
            or recipe.child_pal_id not in pal_ids
        ):
            errors.add("CATALOG_REFERENCE_INVALID")
        if recipe.parent_a_pal_id > recipe.parent_b_pal_id:
            errors.add("CATALOG_PARENT_ORDER_INVALID")
        key = (recipe.parent_a_pal_id, recipe.parent_b_pal_id, recipe.recipe_type)
        previous_child = recipe_keys.get(key)
        if previous_child is not None:
            errors.add(
                "CATALOG_RECIPE_CONFLICT"
                if previous_child != recipe.child_pal_id
                else "CATALOG_DUPLICATE_ID"
            )
        recipe_keys[key] = recipe.child_pal_id

    if len({record.passive_skill_id for record in passive_skills}) != len(passive_skills):
        errors.add("CATALOG_DUPLICATE_ID")
    if len({record.active_skill_id for record in active_skills}) != len(active_skills):
        errors.add("CATALOG_DUPLICATE_ID")
    if not all((record.locale, record.text_key) for record in localizations):
        errors.add("CATALOG_LOCALIZATION_KEY_INVALID")
