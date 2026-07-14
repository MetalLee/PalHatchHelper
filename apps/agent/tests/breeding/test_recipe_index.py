import pytest

from pal_hatch_helper.breeding.index import BreedingRecipeIndex
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

from .factories import recipe


def test_parent_order_is_normalized_and_special_recipe_overrides_normal() -> None:
    index = BreedingRecipeIndex.build(
        (
            recipe("pal-b", "pal-a", "normal-child"),
            recipe("pal-a", "pal-b", "special-child", recipe_type="special"),
        )
    )

    resolved = index.resolve("pal-b", "pal-a")

    assert resolved is not None
    assert resolved.child_pal_id == "special-child"
    assert resolved.recipe_type == "special"
    assert index.recipes_for_child("normal-child") == ()
    assert index.effective_recipe_count == 1


def test_conflicting_children_in_the_same_recipe_type_are_rejected() -> None:
    with pytest.raises(StructuredError) as raised:
        BreedingRecipeIndex.build(
            (
                recipe("pal-a", "pal-b", "child-a", recipe_type="special"),
                recipe("pal-b", "pal-a", "child-b", recipe_type="special"),
            )
        )

    assert raised.value.code is ErrorCode.BREEDING_RECIPE_CONFLICT
