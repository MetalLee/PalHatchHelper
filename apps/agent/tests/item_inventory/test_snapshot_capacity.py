from pal_hatch_helper.generated import CanonicalBase, CanonicalItemStack
from pal_hatch_helper.item_inventory.recipe_capacity import (
    IngredientFact,
    RecipeCapacityCalculator,
    RecipeFact,
    capacities_for_snapshot,
)


def test_snapshot_capacity_is_grouped_by_guild_and_ignores_unresolved_stacks() -> None:
    calculator = RecipeCapacityCalculator(
        [
            RecipeFact(
                recipe_id="recipe.nail",
                product_item_id="nail",
                product_count=5,
                ingredients=(IngredientFact(slot=1, item_id="ingot", count=2),),
                craft_kind="handcraft",
                deny_recipe_chain=(),
            )
        ]
    )
    bases = [CanonicalBase(base_id="base-1", guild_uid="guild-1", name="Ore Base")]
    stacks = [
        CanonicalItemStack(
            container_id="box-1",
            item_id="ingot",
            quantity=6,
            container_type="storage_box",
            base_id="base-1",
            guild_uid="guild-1",
            slot_index=0,
            resolution_status="resolved",
        ),
        CanonicalItemStack(
            container_id="box-unknown",
            item_id="ingot",
            quantity=100,
            container_type="unknown",
            base_id=None,
            guild_uid=None,
            slot_index=0,
            resolution_status="unresolved",
        ),
    ]

    capacities = capacities_for_snapshot(calculator, bases, stacks)

    assert len(capacities) == 1
    assert capacities[0].guild_uid == "guild-1"
    assert capacities[0].item_id == "nail"
    assert capacities[0].craftable_additional == 15
