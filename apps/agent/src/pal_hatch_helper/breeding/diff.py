from collections.abc import Iterable

from pal_hatch_helper.generated import (
    BreedingDataDiffCounts,
    BreedingDataDiffReport,
    BreedingRecipeChange,
    BreedingRecipeSnapshot,
    CatalogBreedingRecipe,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

type RecipeKey = tuple[str, str, str]


def build_breeding_data_diff(
    before: Iterable[CatalogBreedingRecipe],
    after: Iterable[CatalogBreedingRecipe],
    *,
    from_content_hash: str,
    to_content_hash: str,
) -> BreedingDataDiffReport:
    before_by_key = _by_key(before)
    after_by_key = _by_key(after)
    before_keys = set(before_by_key)
    after_keys = set(after_by_key)

    added = [_snapshot(after_by_key[key]) for key in sorted(after_keys - before_keys)]
    removed = [_snapshot(before_by_key[key]) for key in sorted(before_keys - after_keys)]
    changed: list[BreedingRecipeChange] = []
    unchanged = 0
    for key in sorted(before_keys & after_keys):
        old = before_by_key[key]
        new = after_by_key[key]
        metadata_changed = old.metadata != new.metadata
        if old.child_pal_id != new.child_pal_id or metadata_changed:
            changed.append(
                BreedingRecipeChange(
                    parent_a_pal_id=key[0],
                    parent_b_pal_id=key[1],
                    recipe_type=key[2],
                    before_child_pal_id=old.child_pal_id,
                    after_child_pal_id=new.child_pal_id,
                    metadata_changed=metadata_changed,
                )
            )
        else:
            unchanged += 1
    return BreedingDataDiffReport(
        schema_version="1.0.0",
        from_content_hash=from_content_hash,
        to_content_hash=to_content_hash,
        added=added,
        removed=removed,
        changed=changed,
        counts=BreedingDataDiffCounts(
            added=len(added),
            removed=len(removed),
            changed=len(changed),
            unchanged=unchanged,
        ),
    )


def _by_key(recipes: Iterable[CatalogBreedingRecipe]) -> dict[RecipeKey, CatalogBreedingRecipe]:
    values: dict[RecipeKey, CatalogBreedingRecipe] = {}
    for recipe in recipes:
        key = (recipe.parent_a_pal_id, recipe.parent_b_pal_id, recipe.recipe_type)
        previous = values.get(key)
        if previous is not None and previous != recipe:
            raise StructuredError(
                code=ErrorCode.BREEDING_RECIPE_CONFLICT,
                summary="A breeding diff input contains conflicting recipes.",
                retryable=False,
            )
        values[key] = recipe
    return values


def _snapshot(recipe: CatalogBreedingRecipe) -> BreedingRecipeSnapshot:
    return BreedingRecipeSnapshot(
        parent_a_pal_id=recipe.parent_a_pal_id,
        parent_b_pal_id=recipe.parent_b_pal_id,
        child_pal_id=recipe.child_pal_id,
        recipe_type=recipe.recipe_type,
        metadata=recipe.metadata,
    )
