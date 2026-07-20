from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine

from .factories import inventory_pal, limits, recipe, request, search


def test_missing_parent_is_returned_as_a_non_adoptable_requirement() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (inventory_pal("a-m", "pal-a", "male", passives=("wanted",)),),
            desired_passive_ids=("wanted",),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert result.routes
    route = result.routes[0]
    assert route.feasibility_status.value == "needs_inventory"
    assert not route.adoptable
    assert route.missing_pal_count == 1
    assert route.inventory_coverage == 0.5
    assert len(route.missing_requirements) == 1
    requirement = route.missing_requirements[0]
    assert requirement.pal_id == "pal-b"
    assert requirement.gender.value == "female"
    assert requirement.quantity == 1
    step = route.steps[0]
    missing = next(
        parent for parent in (step.parent_a, step.parent_b) if parent.source_type.value == "missing"
    )
    assert missing.instance_uid is None
    assert missing.owner_player_id is None
    assert missing.location_type is None


def test_same_species_pair_reports_the_missing_opposite_gender_separately() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request("pal-target", (inventory_pal("same-m", "pal-same", "male"),)),
        (recipe("pal-same", "pal-same", "pal-target"),),
    )

    assert result.routes
    route = result.routes[0]
    assert route.missing_pal_count == 1
    assert [
        (item.pal_id, item.gender.value, item.quantity) for item in route.missing_requirements
    ] == [("pal-same", "female", 1)]


def test_existing_target_never_becomes_a_zero_step_completion() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("owned-target", "pal-target", "male"),
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
            ),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert result.routes
    assert all(route.step_count > 0 for route in result.routes)
    assert all(route.existing_target_instance_uid is None for route in result.routes)


def test_ready_route_is_ranked_before_a_shorter_route_with_missing_inventory() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
                inventory_pal("c-m", "pal-c", "male"),
            ),
        ),
        (
            recipe("pal-missing-a", "pal-missing-b", "pal-target"),
            recipe("pal-a", "pal-b", "pal-mid"),
            recipe("pal-c", "pal-mid", "pal-target"),
        ),
    )

    assert result.routes
    assert result.routes[0].feasibility_status.value == "ready"
    assert result.routes[0].adoptable
    assert result.routes[0].generation_count == 2
    assert any(route.feasibility_status.value == "needs_inventory" for route in result.routes)


def test_missing_fallback_cannot_fill_the_candidate_cap_before_a_ready_route() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
                *(inventory_pal(f"c-m-{index}", "pal-c", "male") for index in range(8)),
            ),
            search_limits=limits(max_candidate_routes=3, max_results=4),
        ),
        (
            recipe("pal-a", "pal-b", "pal-mid"),
            recipe("pal-c", "pal-mid", "pal-target"),
        ),
    )

    assert result.routes
    assert result.routes[0].adoptable
    assert result.routes[0].generation_count == 2
