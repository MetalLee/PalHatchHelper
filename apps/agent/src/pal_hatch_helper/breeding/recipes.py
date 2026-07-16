from collections.abc import Iterable

from pal_hatch_helper.breeding.index import BreedingRecipeIndex, ConcreteGender
from pal_hatch_helper.generated import CatalogBreedingRecipe


def resolve_breeding_child(
    recipes: Iterable[CatalogBreedingRecipe],
    parent_a_pal_id: str,
    parent_b_pal_id: str,
    parent_a_gender: ConcreteGender | None = None,
    parent_b_gender: ConcreteGender | None = None,
) -> str | None:
    """Resolve a pair deterministically, with special recipes taking priority."""

    resolved = BreedingRecipeIndex.build(recipes).resolve(
        parent_a_pal_id,
        parent_b_pal_id,
        parent_a_gender,
        parent_b_gender,
    )
    return resolved.child_pal_id if resolved is not None else None
