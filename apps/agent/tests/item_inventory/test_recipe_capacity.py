from pal_hatch_helper.item_inventory.recipe_capacity import (
    IngredientFact,
    RecipeCapacityCalculator,
    RecipeFact,
)


def recipe(
    recipe_id: str,
    product: str,
    product_count: int,
    *ingredients: tuple[str, int],
    deny: tuple[str, ...] = (),
) -> RecipeFact:
    return RecipeFact(
        recipe_id=recipe_id,
        product_item_id=product,
        product_count=product_count,
        ingredients=tuple(
            IngredientFact(slot=index, item_id=item_id, count=count)
            for index, (item_id, count) in enumerate(ingredients, 1)
        ),
        craft_kind="handcraft",
        deny_recipe_chain=deny,
    )


def test_batch_output_and_existing_intermediate_inventory_are_consumed_once() -> None:
    calculator = RecipeCapacityCalculator(
        [
            recipe("r.ingot", "ingot", 2, ("ore", 3)),
            recipe("r.nail", "nail", 5, ("ingot", 2)),
        ]
    )

    result = calculator.calculate("nail", {"ore": 9, "ingot": 1, "nail": 4})

    assert result.on_hand == 4
    assert result.craftable_additional == 15
    assert result.obtainable_total == 19
    assert [(step.recipe_id, step.batches) for step in result.recipe_plan] == [
        ("r.ingot", 3),
        ("r.nail", 3),
    ]


def test_shared_raw_material_is_not_double_counted_across_branches() -> None:
    calculator = RecipeCapacityCalculator(
        [
            recipe("r.a", "part_a", 1, ("ore", 2)),
            recipe("r.b", "part_b", 1, ("ore", 3)),
            recipe("r.final", "machine", 1, ("part_a", 1), ("part_b", 1)),
        ]
    )

    result = calculator.calculate("machine", {"ore": 9})

    assert result.craftable_additional == 1
    assert result.limiting_materials == {"ore": 1}


def test_nested_alternative_backtracks_when_a_later_branch_needs_shared_material() -> None:
    calculator = RecipeCapacityCalculator(
        [
            recipe("r.a.ore", "part_a", 1, ("ore", 2)),
            recipe("r.a.stone", "part_a", 1, ("stone", 2)),
            recipe("r.b", "part_b", 1, ("ore", 3)),
            recipe("r.final", "machine", 1, ("part_a", 1), ("part_b", 1)),
        ]
    )

    result = calculator.calculate("machine", {"ore": 3, "stone": 2})

    assert result.craftable_additional == 1
    assert [step.recipe_id for step in result.recipe_plan] == [
        "r.a.stone",
        "r.b",
        "r.final",
    ]


def test_alternative_recipes_are_reported_and_best_is_deterministic() -> None:
    calculator = RecipeCapacityCalculator(
        [
            recipe("r.fast", "cake", 1, ("flour", 2)),
            recipe("r.bulk", "cake", 2, ("berry", 3)),
        ]
    )

    result = calculator.calculate("cake", {"flour": 6, "berry": 6})

    alternatives = [
        (alternative.recipe_id, alternative.craftable_additional)
        for alternative in result.alternatives
    ]
    assert alternatives == [
        ("r.bulk", 4),
        ("r.fast", 3),
    ]
    assert result.selected_recipe_id == "r.bulk"
    assert result.craftable_additional == 4


def test_deny_recipe_chain_prevents_the_forbidden_nested_recipe() -> None:
    calculator = RecipeCapacityCalculator(
        [
            recipe("r.powder", "powder", 1, ("stone", 1)),
            recipe("r.blocked", "rocket", 1, ("powder", 1), deny=("powder",)),
        ]
    )

    result = calculator.calculate("rocket", {"stone": 10})

    assert result.craftable_additional == 0
    assert result.limiting_materials == {"powder": 1}


def test_leaf_material_and_recipe_cycle_fail_closed() -> None:
    leaf = RecipeCapacityCalculator([recipe("r.food", "meal", 1, ("berry", 2))])
    cycle = RecipeCapacityCalculator(
        [
            recipe("r.a", "a", 1, ("b", 1)),
            recipe("r.b", "b", 1, ("a", 1)),
        ]
    )

    leaf_result = leaf.calculate("meal", {"berry": 1})
    cycle_result = cycle.calculate("a", {})

    assert leaf_result.craftable_additional == 0
    assert leaf_result.limiting_materials == {"berry": 1}
    assert cycle_result.craftable_additional == 0
    assert cycle_result.status == "recipe_cycle"


def test_cooking_is_supported_but_other_production_is_not_counted() -> None:
    calculator = RecipeCapacityCalculator(
        [
            RecipeFact(
                recipe_id="r.cook",
                product_item_id="meal",
                product_count=1,
                ingredients=(IngredientFact(slot=1, item_id="berry", count=2),),
                craft_kind="cooking",
                deny_recipe_chain=(),
            ),
            RecipeFact(
                recipe_id="r.ranch",
                product_item_id="milk",
                product_count=1,
                ingredients=(IngredientFact(slot=1, item_id="feed", count=1),),
                craft_kind="other",
                deny_recipe_chain=(),
            ),
        ]
    )

    assert calculator.calculate("meal", {"berry": 4}).craftable_additional == 2
    assert calculator.calculate("milk", {"feed": 100}).status == "no_supported_recipe"
