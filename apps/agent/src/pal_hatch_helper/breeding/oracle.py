from pal_hatch_helper.breeding.index import BreedingRecipeIndex
from pal_hatch_helper.breeding.search import SpeciesRoute


def enumerate_species_routes_exhaustive(
    index: BreedingRecipeIndex,
    *,
    starting_species: frozenset[str],
    target_pal_id: str,
    max_generations: int,
) -> tuple[SpeciesRoute, ...]:
    """Small-graph exhaustive Oracle. It intentionally has no production limits."""

    routes_by_pal: dict[str, dict[str, SpeciesRoute]] = {
        pal_id: {f"leaf:{pal_id}": SpeciesRoute.leaf(pal_id)} for pal_id in sorted(starting_species)
    }
    for generation in range(1, max_generations + 1):
        snapshot = {
            pal_id: tuple(sorted(values.values(), key=lambda route: route.signature))
            for pal_id, values in routes_by_pal.items()
        }
        additions: list[SpeciesRoute] = []
        for recipe in index.recipes:
            for left in snapshot.get(recipe.parent_a_pal_id, ()):
                for right in snapshot.get(recipe.parent_b_pal_id, ()):
                    if 1 + max(left.generation_count, right.generation_count) != generation:
                        continue
                    additions.append(SpeciesRoute.combine(recipe, left, right))
        for route in sorted(additions, key=lambda item: item.signature):
            routes_by_pal.setdefault(route.pal_id, {}).setdefault(route.signature, route)
    return tuple(
        sorted(
            routes_by_pal.get(target_pal_id, {}).values(),
            key=lambda route: route.signature,
        )
    )
