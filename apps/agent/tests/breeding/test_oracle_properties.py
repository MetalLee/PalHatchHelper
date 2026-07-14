import random

from pal_hatch_helper.breeding.index import BreedingRecipeIndex
from pal_hatch_helper.breeding.limits import SearchBudget
from pal_hatch_helper.breeding.oracle import enumerate_species_routes_exhaustive
from pal_hatch_helper.breeding.search import search_species_routes

from .factories import recipe


def test_optimized_search_matches_the_small_exhaustive_oracle() -> None:
    index = BreedingRecipeIndex.build(
        (
            recipe("pal-a", "pal-b", "pal-c"),
            recipe("pal-a", "pal-c", "pal-target"),
            recipe("pal-b", "pal-c", "pal-target"),
        )
    )
    starting_species = frozenset({"pal-a", "pal-b"})

    optimized = search_species_routes(
        index,
        starting_species=starting_species,
        target_pal_id="pal-target",
        max_generations=2,
        max_routes_per_pal=10_000,
        budget=SearchBudget(
            max_expanded_nodes=1_000_000,
            timeout_ms=60_000,
            clock=lambda: 0.0,
        ),
    )
    oracle = enumerate_species_routes_exhaustive(
        index,
        starting_species=starting_species,
        target_pal_id="pal-target",
        max_generations=2,
    )

    assert {route.signature for route in optimized.routes} == {route.signature for route in oracle}
    assert not optimized.pruned_routes


def test_fixed_seed_random_graphs_match_oracle_and_never_invent_relations() -> None:
    randomizer = random.Random(20260714)
    species = [f"pal-{index}" for index in range(6)]
    pairs = [(left, right) for left in species for right in species if left <= right]

    for _case in range(25):
        randomizer.shuffle(pairs)
        chosen_pairs = pairs[: randomizer.randint(4, 9)]
        recipes = []
        for left, right in chosen_pairs:
            parents = (left, right) if randomizer.getrandbits(1) else (right, left)
            recipes.append(recipe(parents[0], parents[1], randomizer.choice(species)))
        index = BreedingRecipeIndex.build(tuple(recipes))
        budget = SearchBudget(
            max_expanded_nodes=1_000_000,
            timeout_ms=60_000,
            clock=lambda: 0.0,
        )
        optimized = search_species_routes(
            index,
            starting_species=frozenset(species[:3]),
            target_pal_id=species[-1],
            max_generations=2,
            max_routes_per_pal=100_000,
            budget=budget,
        )
        oracle = enumerate_species_routes_exhaustive(
            index,
            starting_species=frozenset(species[:3]),
            target_pal_id=species[-1],
            max_generations=2,
        )

        assert {route.signature for route in optimized.routes} == {
            route.signature for route in oracle
        }
        for route in optimized.routes:
            for relation in route.relations:
                effective = index.resolve(relation.parent_a_pal_id, relation.parent_b_pal_id)
                assert effective is not None
                assert effective.child_pal_id == relation.child_pal_id
