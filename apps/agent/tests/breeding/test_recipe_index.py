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


def test_gender_specific_children_are_selected_by_parent_orientation() -> None:
    index = BreedingRecipeIndex.build(
        (
            recipe(
                "pal-a",
                "pal-b",
                "child-a",
                recipe_type="special",
                parent_a_gender="female",
                parent_b_gender="male",
            ),
            recipe(
                "pal-a",
                "pal-b",
                "child-b",
                recipe_type="special",
                parent_a_gender="male",
                parent_b_gender="female",
            ),
        )
    )

    female_male = index.resolve("pal-a", "pal-b", "female", "male")
    male_female = index.resolve("pal-a", "pal-b", "male", "female")

    assert female_male is not None
    assert female_male.child_pal_id == "child-a"
    assert male_female is not None
    assert male_female.child_pal_id == "child-b"
    assert index.effective_recipe_count == 2
