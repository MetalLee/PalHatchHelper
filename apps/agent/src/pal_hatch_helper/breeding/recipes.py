from collections.abc import Iterable

from pal_hatch_helper.generated import CatalogBreedingRecipe
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


def resolve_breeding_child(
    recipes: Iterable[CatalogBreedingRecipe],
    parent_a_pal_id: str,
    parent_b_pal_id: str,
) -> str | None:
    """Resolve a pair deterministically, with special recipes taking priority."""

    parent_a, parent_b = sorted((parent_a_pal_id, parent_b_pal_id))
    matches = [
        recipe
        for recipe in recipes
        if recipe.parent_a_pal_id == parent_a and recipe.parent_b_pal_id == parent_b
    ]
    for recipe_type in ("special", "normal"):
        children = {recipe.child_pal_id for recipe in matches if recipe.recipe_type == recipe_type}
        if len(children) > 1:
            raise StructuredError(
                code=ErrorCode.BREEDING_RECIPE_CONFLICT,
                summary=(
                    "The fixed breeding version contains conflicting recipes for a parent pair."
                ),
                retryable=False,
            )
        if children:
            return next(iter(children))
    return None
