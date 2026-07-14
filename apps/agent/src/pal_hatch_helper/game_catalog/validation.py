import json
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ValidationError

from pal_hatch_helper.game_catalog.hashing import compute_content_hash, sha256_file
from pal_hatch_helper.game_catalog.jsonl import read_jsonl
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

SUPPORTED_SCHEMA_VERSIONS = frozenset({"1.0.0"})


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
