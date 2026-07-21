from collections.abc import Sequence

import pytest

from pal_hatch_helper.breeding.assignment import assign_species_route
from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.breeding.index import BreedingRecipeIndex
from pal_hatch_helper.breeding.limits import SearchBudget
from pal_hatch_helper.breeding.search import direct_target_routes
from pal_hatch_helper.generated import BreedingRouteCandidate, OptimizationMode

from .factories import (
    REQUESTER_ID,
    inventory_pal,
    limits,
    recipe,
    request,
    search,
)


def _three_generation_inventory():
    return (
        inventory_pal("source-a-m", "pal-a", "male", passives=("p1", "p4")),
        inventory_pal("source-b-f", "pal-b", "female", passives=("p4",)),
        inventory_pal("source-c-m", "pal-c", "male", passives=("p3", "p4")),
        inventory_pal(
            "source-target-f",
            "pal-target",
            "female",
            passives=("p2", "p4"),
        ),
        inventory_pal("source-zero-m", "pal-zero", "male"),
    )


def _three_generation_recipes():
    return (
        recipe("pal-a", "pal-b", "pal-mid"),
        recipe("pal-c", "pal-mid", "pal-target"),
        recipe("pal-target", "pal-target", "pal-target"),
        recipe("pal-missing", "pal-zero", "pal-target"),
    )


def test_missing_leaf_has_zero_coverage_and_cannot_fill_a_target_passive() -> None:
    inventory = inventory_pal("source-zero-m", "pal-zero", "male")
    index = BreedingRecipeIndex.build((recipe("pal-missing", "pal-zero", "pal-target"),))
    route = direct_target_routes(
        index,
        inventory_species=frozenset(("pal-zero",)),
        target_pal_id="pal-target",
        max_routes=3,
    ).routes[0]

    result = assign_species_route(
        route,
        inventory_by_species={"pal-zero": (inventory,)},
        desired_passive_ids=("p1",),
        requester_player_id=REQUESTER_ID,
        max_states_per_mask=3,
        budget=SearchBudget(
            max_expanded_nodes=100,
            timeout_ms=1_000,
            clock=lambda: 0.0,
        ),
    )

    assert result.assignments == ()


def test_real_inventory_passives_converge_across_three_gendered_generations() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            _three_generation_inventory(),
            desired_passive_ids=("p4", "p2", "p1", "p3"),
        ),
        _three_generation_recipes(),
    )

    assert result.routes
    route = result.routes[0]
    assert route.feasibility_status.value == "ready"
    assert route.adoptable
    assert route.missing_pal_count == 0
    assert route.missing_passive_ids == []
    assert route.inventory_passive_coverage == 1
    assert route.generation_count == 3
    assert [step.child_pal_id for step in route.steps] == [
        "pal-mid",
        "pal-target",
        "pal-target",
    ]
    assert [step.required_passive_ids for step in route.steps] == [
        ["p1", "p4"],
        ["p1", "p3", "p4"],
        ["p1", "p2", "p3", "p4"],
    ]
    assert [step.child_required_gender for step in route.steps] == [
        "female",
        "male",
        None,
    ]
    assert {source.passive_id for source in route.passive_sources} == {
        "p1",
        "p2",
        "p3",
        "p4",
    }
    assert all(source.source_instance_uid for source in route.passive_sources)
    assert all(source.source_instance_uid.startswith("source-") for source in route.passive_sources)
    assert not any(
        {step.parent_a.pal_id, step.parent_b.pal_id} == {"pal-zero", "pal-missing"}
        for candidate in result.routes
        for step in candidate.steps
    )


@pytest.mark.parametrize("mode", list(OptimizationMode))
def test_every_optimization_mode_keeps_ready_routes_before_shorter_fallbacks(
    mode: OptimizationMode,
) -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            _three_generation_inventory(),
            desired_passive_ids=("p1", "p2", "p3", "p4"),
            optimization_mode=mode,
        ),
        _three_generation_recipes(),
    )

    assert result.routes[0].feasibility_status.value == "ready"
    assert all(
        not seen_fallback or route.feasibility_status.value == "needs_inventory"
        for seen_fallback, route in _with_fallback_prefix(result.routes)
    )
    for ranking in result.mode_rankings:
        routes_by_key = {route.route_key: route for route in result.routes}
        ordered = [routes_by_key[key] for key in ranking.route_keys]
        assert all(
            not seen_fallback or route.feasibility_status.value == "needs_inventory"
            for seen_fallback, route in _with_fallback_prefix(ordered)
        )


def test_fallback_pool_does_not_consume_the_ready_candidate_cap() -> None:
    fallback_recipes = tuple(
        recipe(f"missing-{index}", "pal-zero", "pal-target") for index in range(12)
    )
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            _three_generation_inventory(),
            desired_passive_ids=("p1", "p2", "p3", "p4"),
            search_limits=limits(max_candidate_routes=3, max_results=4),
        ),
        (*_three_generation_recipes()[:3], *fallback_recipes),
    )

    assert result.routes
    assert result.routes[0].feasibility_status.value == "ready"
    assert result.routes[0].generation_count == 3


def test_missing_parent_never_receives_required_passives() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (inventory_pal("source-a-m", "pal-a", "male", passives=("p1",)),),
            desired_passive_ids=("p1",),
        ),
        (recipe("pal-a", "pal-missing", "pal-target"),),
    )

    route = result.routes[0]
    missing = next(
        parent
        for parent in (route.steps[0].parent_a, route.steps[0].parent_b)
        if parent.source_type.value == "missing"
    )
    assert missing.required_passive_ids == []
    assert route.missing_requirements[0].required_passive_ids == []


def test_inventory_wide_missing_passive_is_reported_without_binding_it_to_a_pal() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("source-a-m", "pal-a", "male", passives=("p1",)),
                inventory_pal("source-b-f", "pal-b", "female"),
            ),
            desired_passive_ids=("p1", "p2"),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert result.missing_passive_ids == ["p2"]
    assert result.routes
    route = result.routes[0]
    assert route.feasibility_status.value == "needs_inventory"
    assert not route.adoptable
    assert route.missing_pal_count == 0
    assert route.missing_requirements == []
    assert route.missing_passive_ids == ["p2"]
    assert route.inventory_passive_coverage == 0.5
    assert {source.passive_id for source in route.passive_sources} == {"p1"}


def _with_fallback_prefix(
    routes: Sequence[BreedingRouteCandidate],
) -> list[tuple[bool, BreedingRouteCandidate]]:
    seen_fallback = False
    values = []
    for route in routes:
        values.append((seen_fallback, route))
        if route.feasibility_status.value == "needs_inventory":
            seen_fallback = True
    return values
