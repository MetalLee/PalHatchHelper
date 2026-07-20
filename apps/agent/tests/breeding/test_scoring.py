import pytest

from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    CatalogBreedingRecipe,
    OptimizationMode,
)

from .factories import OTHER_PLAYER_ID, inventory_pal, limits, recipe, request, search

EXPECTED_COMPONENTS = {
    "acquisition_cost",
    "attempt_cost",
    "borrowing",
    "intermediate_cost",
    "inventory_coverage",
    "passive_concentration",
    "route_length",
    "stability",
}


def _comparison_input() -> tuple[BreedingEngineInventoryPal, ...]:
    return (
        inventory_pal("direct-a-m", "direct-a", "male"),
        inventory_pal(
            "direct-b-f",
            "direct-b",
            "female",
            owner_player_id=OTHER_PLAYER_ID,
        ),
        inventory_pal("owned-a-m", "owned-a", "male"),
        inventory_pal("owned-b-f", "owned-b", "female"),
        inventory_pal("owned-c-m", "owned-c", "male"),
    )


def _comparison_recipes() -> tuple[CatalogBreedingRecipe, ...]:
    return (
        recipe("direct-a", "direct-b", "pal-target"),
        recipe("owned-a", "owned-b", "owned-mid"),
        recipe("owned-c", "owned-mid", "pal-target"),
    )


def test_fastest_and_least_borrowing_profiles_choose_different_routes() -> None:
    engine = DeterministicBreedingEngine()
    fastest = search(
        engine,
        request(
            "pal-target",
            _comparison_input(),
            optimization_mode=OptimizationMode.FASTEST,
        ),
        _comparison_recipes(),
    )
    least_borrowing = search(
        engine,
        request(
            "pal-target",
            _comparison_input(),
            optimization_mode=OptimizationMode.LEAST_BORROWING,
        ),
        _comparison_recipes(),
    )

    assert fastest.routes[0].generation_count == 1
    assert fastest.routes[0].borrowed_pal_count == 1
    assert least_borrowing.routes[0].generation_count == 2
    assert least_borrowing.routes[0].borrowed_pal_count == 0


def test_score_breakdown_contains_all_components_weights_and_contributions() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request("pal-target", _comparison_input()),
        _comparison_recipes(),
    )

    assert result.routes
    route = result.routes[0]
    assert len(route.score_breakdown.mode_scores) == 4
    assert len(result.mode_rankings) == 4
    for mode_score in route.score_breakdown.mode_scores:
        components = {component.component.value for component in mode_score.components}
        assert components == EXPECTED_COMPONENTS
        assert sum(component.weight for component in mode_score.components) == pytest.approx(1)
        assert mode_score.total_score == pytest.approx(
            sum(component.weighted_score for component in mode_score.components),
            abs=0.001,
        )
    assert route.score_breakdown.estimate_basis == "strategy_heuristic_no_verified_probability"
    assert route.difficulty.value in {"low", "medium", "high"}
    assert route.estimated_attempts_min <= route.estimated_attempts_max
    assert not hasattr(route, "success_probability")


def test_three_or_more_legal_routes_produce_comparable_candidates() -> None:
    inventory: list[BreedingEngineInventoryPal] = []
    recipes: list[CatalogBreedingRecipe] = []
    for index in range(3):
        inventory.extend(
            (
                inventory_pal(f"a-{index}-m", f"pal-a-{index}", "male"),
                inventory_pal(f"b-{index}-f", f"pal-b-{index}", "female"),
            )
        )
        recipes.append(recipe(f"pal-a-{index}", f"pal-b-{index}", "pal-target"))

    result = search(
        DeterministicBreedingEngine(),
        request("pal-target", inventory),
        tuple(recipes),
    )

    assert len(result.routes) >= 3
    assert "FEWER_THAN_THREE_LEGAL_ROUTES" not in result.explanation_codes
    assert all(ranking.route_keys for ranking in result.mode_rankings)


def test_mode_winners_are_selected_from_the_full_scored_pool_before_truncation() -> None:
    inventory: list[BreedingEngineInventoryPal] = [
        inventory_pal("owned-a-m", "owned-a", "male"),
        inventory_pal("owned-b-f", "owned-b", "female"),
        inventory_pal("owned-c-m", "owned-c", "male"),
    ]
    recipes: list[CatalogBreedingRecipe] = [
        recipe("owned-a", "owned-b", "owned-mid"),
        recipe("owned-c", "owned-mid", "pal-target"),
    ]
    for index in range(4):
        inventory.extend(
            (
                inventory_pal(
                    f"borrowed-a-{index}-m",
                    f"borrowed-a-{index}",
                    "male",
                    owner_player_id=OTHER_PLAYER_ID,
                ),
                inventory_pal(
                    f"borrowed-b-{index}-f",
                    f"borrowed-b-{index}",
                    "female",
                    owner_player_id=OTHER_PLAYER_ID,
                ),
            )
        )
        recipes.append(recipe(f"borrowed-a-{index}", f"borrowed-b-{index}", "pal-target"))

    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            inventory,
            search_limits=limits(max_results=4),
        ),
        recipes,
    )

    by_key = {route.route_key: route for route in result.routes}
    winners = {
        ranking.optimization_mode.value: by_key[ranking.route_keys[0]]
        for ranking in result.mode_rankings
    }
    assert winners["least_borrowing"].borrowed_pal_count == 0
    assert winners["fastest"].generation_count == 1
    assert all(key in by_key for ranking in result.mode_rankings for key in ranking.route_keys)
