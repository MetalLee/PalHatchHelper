import hashlib
import json
from dataclasses import dataclass
from typing import cast

from pydantic import ValidationError

from pal_hatch_helper.generated import (
    BreedingDataValidationCounts,
    BreedingDataValidationIssue,
    BreedingDataValidationReport,
    BreedingRecipeSourceRecord,
    CatalogBreedingRecipe,
)


@dataclass(frozen=True, slots=True)
class BreedingRecipeValidationResult:
    recipes: tuple[CatalogBreedingRecipe, ...]
    report: BreedingDataValidationReport


def transform_and_validate_recipes(
    content: bytes,
    *,
    known_pal_ids: frozenset[str],
    raw_content_hash: str,
    source_version: str,
) -> BreedingRecipeValidationResult:
    """Transform one strict source document into canonical unordered-parent recipes."""

    issues: dict[str, set[int]] = {}
    records: list[object] = []
    document_version: object = None
    if hashlib.sha256(content).hexdigest() != raw_content_hash:
        _issue(issues, "BREEDING_RAW_HASH_MISMATCH")
    try:
        document = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        document = None
        _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID")
    if isinstance(document, dict):
        if set(document) != {"source_version", "recipes"}:
            _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID")
        document_version = document.get("source_version")
        if not isinstance(document_version, str) or not 1 <= len(document_version) <= 120:
            _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID")
        candidate_records = document.get("recipes")
        if isinstance(candidate_records, list):
            records = cast(list[object], candidate_records)
        else:
            _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID")
    elif document is not None:
        _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID")
    if document_version != source_version:
        _issue(issues, "BREEDING_SOURCE_VERSION_MISMATCH")

    normalized: list[tuple[int, CatalogBreedingRecipe]] = []
    for index, raw_record in enumerate(records):
        try:
            source_record = BreedingRecipeSourceRecord.model_validate(raw_record)
        except ValidationError:
            _issue(issues, "BREEDING_RECIPE_SCHEMA_INVALID", index)
            continue
        parent_a, parent_b = sorted(source_record.parents)
        recipe = CatalogBreedingRecipe(
            parent_a_pal_id=parent_a,
            parent_b_pal_id=parent_b,
            child_pal_id=source_record.child_pal_id,
            recipe_type=source_record.recipe_type.value,
            metadata=source_record.metadata,
        )
        if not {
            recipe.parent_a_pal_id,
            recipe.parent_b_pal_id,
            recipe.child_pal_id,
        }.issubset(known_pal_ids):
            _issue(issues, "BREEDING_PAL_ID_UNKNOWN", index)
        normalized.append((index, recipe))

    exact: dict[tuple[str, str, str, str], int] = {}
    typed_pair: dict[tuple[str, str, str], tuple[str, int]] = {}
    pair_child_types: dict[tuple[str, str, str], tuple[str, int]] = {}
    pair_types: dict[tuple[str, str], set[str]] = {}
    for index, recipe in normalized:
        exact_key = (*_pair(recipe), recipe.recipe_type, recipe.child_pal_id)
        previous_exact = exact.get(exact_key)
        if previous_exact is not None:
            _issue(issues, "BREEDING_RECIPE_DUPLICATE", previous_exact, index)
        else:
            exact[exact_key] = index

        typed_key = (*_pair(recipe), recipe.recipe_type)
        previous_typed = typed_pair.get(typed_key)
        if previous_typed is not None and previous_typed[0] != recipe.child_pal_id:
            _issue(issues, "BREEDING_RECIPE_CONFLICT", previous_typed[1], index)
        else:
            typed_pair.setdefault(typed_key, (recipe.child_pal_id, index))

        pair_child_key = (*_pair(recipe), recipe.child_pal_id)
        previous_type = pair_child_types.get(pair_child_key)
        if previous_type is not None and previous_type[0] != recipe.recipe_type:
            _issue(
                issues,
                "BREEDING_RECIPE_TYPE_CONTRADICTION",
                previous_type[1],
                index,
            )
        else:
            pair_child_types.setdefault(pair_child_key, (recipe.recipe_type, index))
        pair_types.setdefault(_pair(recipe), set()).add(recipe.recipe_type)

    recipes = tuple(
        recipe
        for _, recipe in sorted(
            normalized,
            key=lambda item: (
                item[1].parent_a_pal_id,
                item[1].parent_b_pal_id,
                item[1].recipe_type,
                item[1].child_pal_id,
            ),
        )
    )
    errors = [
        BreedingDataValidationIssue(code=code, record_indexes=sorted(indexes))
        for code, indexes in sorted(issues.items())
    ]
    counts = BreedingDataValidationCounts(
        input_records=len(records),
        normalized_records=len(recipes),
        normal_recipes=sum(recipe.recipe_type == "normal" for recipe in recipes),
        special_recipes=sum(recipe.recipe_type == "special" for recipe in recipes),
        special_overrides=sum(types == {"normal", "special"} for types in pair_types.values()),
    )
    return BreedingRecipeValidationResult(
        recipes=recipes,
        report=BreedingDataValidationReport(
            schema_version="1.0.0",
            raw_content_hash=raw_content_hash,
            source_version=source_version,
            valid=not errors,
            errors=errors,
            warnings=[],
            counts=counts,
        ),
    )


def _pair(recipe: CatalogBreedingRecipe) -> tuple[str, str]:
    return recipe.parent_a_pal_id, recipe.parent_b_pal_id


def _issue(issues: dict[str, set[int]], code: str, *indexes: int) -> None:
    issues.setdefault(code, set()).update(indexes)
