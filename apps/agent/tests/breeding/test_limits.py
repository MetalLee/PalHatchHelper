from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.generated import BreedingEngineInventoryPal, CatalogBreedingRecipe

from .factories import inventory_pal, limits, recipe, request, search


class AdvancingClock:
    def __init__(self, step_seconds: float) -> None:
        self._value = 0.0
        self._step_seconds = step_seconds

    def __call__(self) -> float:
        value = self._value
        self._value += self._step_seconds
        return value


def test_combination_explosion_stops_at_the_global_node_limit() -> None:
    inventory: list[BreedingEngineInventoryPal] = []
    recipes: list[CatalogBreedingRecipe] = []
    for index in range(8):
        inventory.extend(
            (
                inventory_pal(f"m-{index}", f"pal-m-{index}", "male"),
                inventory_pal(f"f-{index}", f"pal-f-{index}", "female"),
            )
        )
        recipes.append(recipe(f"pal-m-{index}", f"pal-f-{index}", f"mid-{index}"))
        recipes.append(recipe(f"mid-{index}", f"pal-m-{(index + 1) % 8}", "pal-target"))

    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            inventory,
            search_limits=limits(max_expanded_nodes=12),
        ),
        tuple(recipes),
    )

    assert "max_expanded_nodes" in {item.value for item in result.diagnostics.hit_limits}
    assert not result.diagnostics.search_complete
    assert result.diagnostics.expanded_nodes <= 12
    assert "SEARCH_LIMIT_REACHED" in result.explanation_codes


def test_timeout_returns_promptly_with_an_explicit_incomplete_result() -> None:
    result = search(
        DeterministicBreedingEngine(clock=AdvancingClock(0.01)),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
            ),
            search_limits=limits(timeout_ms=1),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert "timeout" in {item.value for item in result.diagnostics.hit_limits}
    assert not result.diagnostics.search_complete
    assert not result.diagnostics.returned_all_legal_routes
    assert "SEARCH_TIMEOUT" in result.explanation_codes
