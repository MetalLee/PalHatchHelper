from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.breeding.index import BreedingRecipeIndex

from .factories import inventory_pal, limits, recipe, request, search


def test_multi_generation_route_is_topological_and_uses_only_indexed_relations() -> None:
    recipes = (
        recipe("pal-a", "pal-b", "pal-mid"),
        recipe("pal-c", "pal-mid", "pal-target"),
    )
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
        recipes,
    )

    assert result.routes
    route = result.routes[0]
    assert route.generation_count == 2
    assert [step.child_pal_id for step in route.steps] == ["pal-mid", "pal-target"]
    index = BreedingRecipeIndex.build(recipes)
    for step in route.steps:
        effective = index.resolve(step.parent_a.pal_id, step.parent_b.pal_id)
        assert effective is not None
        assert effective.child_pal_id == step.child_pal_id
        assert effective.recipe_type == step.recipe_type


def test_special_recipe_is_the_only_relation_used_by_search() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-special-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
            ),
        ),
        (
            recipe("pal-a", "pal-b", "pal-normal-target"),
            recipe("pal-b", "pal-a", "pal-special-target", recipe_type="special"),
        ),
    )

    assert result.routes
    assert all(step.recipe_type == "special" for route in result.routes for step in route.steps)
    assert all(
        step.child_pal_id != "pal-normal-target" for route in result.routes for step in route.steps
    )


def test_gender_infeasible_direct_pair_falls_back_to_an_alternative_route() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-m", "pal-b", "male"),
                inventory_pal("c-m", "pal-c", "male"),
                inventory_pal("d-f", "pal-d", "female"),
            ),
        ),
        (
            recipe("pal-a", "pal-b", "pal-target"),
            recipe("pal-c", "pal-d", "pal-target"),
        ),
    )

    assert result.routes
    assert {
        result.routes[0].steps[0].parent_a.instance_uid,
        result.routes[0].steps[0].parent_b.instance_uid,
    } == {"c-m", "d-f"}


def test_no_route_and_fewer_than_three_routes_have_stable_explanations() -> None:
    engine = DeterministicBreedingEngine()
    no_route = search(
        engine,
        request(
            "pal-target",
            (inventory_pal("a-m", "pal-a", "male"),),
        ),
        (),
    )
    one_route = search(
        engine,
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
            ),
        ),
        (recipe("pal-a", "pal-b", "pal-target"),),
    )

    assert no_route.routes == []
    assert "NO_LEGAL_ROUTE" in no_route.explanation_codes
    assert no_route.diagnostics.returned_all_legal_routes
    assert any(route.adoptable for route in one_route.routes)


def test_cycle_graph_terminates_at_the_generation_bound_without_duplicate_routes() -> None:
    result = search(
        DeterministicBreedingEngine(),
        request(
            "pal-target",
            (
                inventory_pal("a-m", "pal-a", "male"),
                inventory_pal("b-f", "pal-b", "female"),
                inventory_pal("c-m", "pal-c", "male"),
                inventory_pal("d-f", "pal-d", "female"),
            ),
            search_limits=limits(max_generations=3),
        ),
        (
            recipe("pal-a", "pal-b", "pal-c"),
            recipe("pal-c", "pal-d", "pal-a"),
            recipe("pal-a", "pal-d", "pal-target"),
        ),
    )

    route_keys = [route.route_key for route in result.routes]
    assert len(route_keys) == len(set(route_keys))
    assert all(route.generation_count <= 3 for route in result.routes)
    assert result.diagnostics.expanded_nodes <= 50_000
