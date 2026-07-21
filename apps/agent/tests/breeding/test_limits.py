from time import perf_counter

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
            search_limits=limits(max_expanded_nodes=20),
        ),
        tuple(recipes),
    )

    assert "max_expanded_nodes" in {item.value for item in result.diagnostics.hit_limits}
    assert not result.diagnostics.search_complete
    assert result.diagnostics.expanded_nodes <= 20
    assert "SEARCH_LIMIT_REACHED" in result.explanation_codes
    assert result.routes
    assert all(route.generation_count > 0 for route in result.routes)


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


def test_formal_catalog_scale_remains_bounded() -> None:
    pal_ids = tuple(f"pal-{index:03d}" for index in range(288))
    direct_pairs = {(pal_ids[index], pal_ids[index + 1]) for index in range(0, 8, 2)}
    recipes = tuple(
        recipe(
            left,
            right,
            (
                "pal-target"
                if (left, right) in direct_pairs
                else pal_ids[(left_index * 17 + right_index) % len(pal_ids)]
            ),
        )
        for left_index, left in enumerate(pal_ids)
        for right_index, right in enumerate(pal_ids[left_index:], start=left_index)
    )
    formal_scale_recipes = (*recipes, recipes[-1])
    inventory = tuple(
        inventory_pal(
            f"formal-{index}",
            pal_ids[index],
            "male" if index % 2 == 0 else "female",
        )
        for index in range(8)
    )

    started = perf_counter()
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            inventory,
            search_limits=limits(
                max_generations=5,
                max_expanded_nodes=10_000,
                timeout_ms=10_000,
                max_species_routes_per_pal=64,
                max_assignment_states_per_mask=4,
                max_candidate_routes=16,
                max_results=4,
            ),
        ),
        formal_scale_recipes,
    )
    elapsed = perf_counter() - started

    assert len(formal_scale_recipes) == 41_617
    assert result.routes
    assert result.routes[0].feasibility_status.value == "ready"
    assert result.diagnostics.expanded_nodes <= 10_000
    assert elapsed < 10
