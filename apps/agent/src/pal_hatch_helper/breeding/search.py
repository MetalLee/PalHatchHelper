from __future__ import annotations

from dataclasses import dataclass

from pal_hatch_helper.breeding.index import (
    BreedingRecipeIndex,
    EffectiveBreedingRecipe,
)
from pal_hatch_helper.breeding.limits import SearchBudget, SearchStopped
from pal_hatch_helper.generated import BreedingSearchLimit


@dataclass(frozen=True, slots=True)
class SpeciesRoute:
    pal_id: str
    recipe: EffectiveBreedingRecipe | None
    parent_a: SpeciesRoute | None
    parent_b: SpeciesRoute | None
    generation_count: int
    step_count: int
    leaf_count: int
    missing_leaf_count: int
    signature: str

    @classmethod
    def leaf(cls, pal_id: str, *, missing: bool = False) -> SpeciesRoute:
        return cls(
            pal_id=pal_id,
            recipe=None,
            parent_a=None,
            parent_b=None,
            generation_count=0,
            step_count=0,
            leaf_count=1,
            missing_leaf_count=int(missing),
            signature=f"leaf:{'missing' if missing else 'inventory'}:{pal_id}",
        )

    @classmethod
    def combine(
        cls,
        recipe: EffectiveBreedingRecipe,
        first: SpeciesRoute,
        second: SpeciesRoute,
    ) -> SpeciesRoute:
        if recipe.parent_a_pal_id == recipe.parent_b_pal_id:
            parent_a, parent_b = sorted((first, second), key=lambda item: item.signature)
        elif first.pal_id == recipe.parent_a_pal_id:
            parent_a, parent_b = first, second
        else:
            parent_a, parent_b = second, first
        signature = f"route:{recipe.signature}[{parent_a.signature}][{parent_b.signature}]"
        return cls(
            pal_id=recipe.child_pal_id,
            recipe=recipe,
            parent_a=parent_a,
            parent_b=parent_b,
            generation_count=1 + max(parent_a.generation_count, parent_b.generation_count),
            step_count=1 + parent_a.step_count + parent_b.step_count,
            leaf_count=parent_a.leaf_count + parent_b.leaf_count,
            missing_leaf_count=(parent_a.missing_leaf_count + parent_b.missing_leaf_count),
            signature=signature,
        )

    @property
    def relations(self) -> tuple[EffectiveBreedingRecipe, ...]:
        if self.recipe is None or self.parent_a is None or self.parent_b is None:
            return ()
        return (*self.parent_a.relations, *self.parent_b.relations, self.recipe)


@dataclass(frozen=True, slots=True)
class SpeciesRouteSearchResult:
    routes: tuple[SpeciesRoute, ...]
    pruned_routes: int
    duplicate_routes: int
    stopped_by: BreedingSearchLimit | None


def direct_target_routes(
    index: BreedingRecipeIndex,
    *,
    inventory_species: frozenset[str],
    target_pal_id: str,
    max_routes: int,
) -> SpeciesRouteSearchResult:
    routes: dict[str, SpeciesRoute] = {}
    duplicate_routes = 0
    for recipe in index.recipes_for_child(target_pal_id):
        route = SpeciesRoute.combine(
            recipe,
            SpeciesRoute.leaf(
                recipe.parent_a_pal_id,
                missing=recipe.parent_a_pal_id not in inventory_species,
            ),
            SpeciesRoute.leaf(
                recipe.parent_b_pal_id,
                missing=recipe.parent_b_pal_id not in inventory_species,
            ),
        )
        if route.signature in routes:
            duplicate_routes += 1
            continue
        routes[route.signature] = route
    ordered = sorted(routes.values(), key=_route_rank)
    return SpeciesRouteSearchResult(
        routes=tuple(ordered[:max_routes]),
        pruned_routes=max(0, len(ordered) - max_routes),
        duplicate_routes=duplicate_routes,
        stopped_by=None,
    )


def search_species_routes(
    index: BreedingRecipeIndex,
    *,
    starting_species: frozenset[str],
    missing_species: frozenset[str] = frozenset(),
    target_pal_id: str,
    max_generations: int,
    max_routes_per_pal: int,
    budget: SearchBudget,
) -> SpeciesRouteSearchResult:
    relevant = _relevant_recipes(index, target_pal_id, max_generations)
    routes_by_pal: dict[str, dict[str, SpeciesRoute]] = {}
    for pal_id in sorted(starting_species | missing_species):
        route = SpeciesRoute.leaf(pal_id, missing=pal_id not in starting_species)
        routes_by_pal[pal_id] = {route.signature: route}
    seen: dict[str, set[str]] = {pal_id: set(routes) for pal_id, routes in routes_by_pal.items()}
    pruned_routes = 0
    duplicate_routes = 0
    stopped_by: BreedingSearchLimit | None = None

    try:
        for generation in range(1, max_generations + 1):
            generation_combination_limit = max_routes_per_pal * 16
            generation_combinations = 0
            generation_limit_reached = False
            snapshot = {
                pal_id: tuple(sorted(values.values(), key=_route_rank))
                for pal_id, values in routes_by_pal.items()
            }
            for recipe in relevant:
                left_routes = snapshot.get(recipe.parent_a_pal_id, ())
                right_routes = snapshot.get(recipe.parent_b_pal_id, ())
                explored_combinations = 0
                pair_limit_reached = False
                for left in left_routes:
                    for right in right_routes:
                        if 1 + max(left.generation_count, right.generation_count) != generation:
                            continue
                        if generation_combinations >= generation_combination_limit:
                            pruned_routes += 1
                            generation_limit_reached = True
                            pair_limit_reached = True
                            break
                        generation_combinations += 1
                        if explored_combinations >= max_routes_per_pal:
                            pruned_routes += 1
                            pair_limit_reached = True
                            break
                        explored_combinations += 1
                        route = SpeciesRoute.combine(recipe, left, right)
                        child_seen = seen.setdefault(route.pal_id, set())
                        if route.signature in child_seen:
                            duplicate_routes += 1
                            continue
                        bucket = routes_by_pal.setdefault(route.pal_id, {})
                        if len(bucket) >= max_routes_per_pal:
                            worst = max(bucket.values(), key=_route_rank)
                            if _route_rank(route) >= _route_rank(worst):
                                child_seen.add(route.signature)
                                pruned_routes += 1
                                continue
                        budget.consume_species()
                        child_seen.add(route.signature)
                        if len(bucket) < max_routes_per_pal:
                            bucket[route.signature] = route
                            continue
                        pruned_routes += 1
                        worst = max(bucket.values(), key=_route_rank)
                        del bucket[worst.signature]
                        bucket[route.signature] = route
                    if pair_limit_reached:
                        break
                if generation_limit_reached:
                    break
    except SearchStopped as stopped:
        stopped_by = stopped.limit

    target_routes = tuple(
        sorted(
            (
                route
                for route in routes_by_pal.get(target_pal_id, {}).values()
                if route.recipe is not None
            ),
            key=_route_rank,
        )
    )
    return SpeciesRouteSearchResult(
        routes=target_routes,
        pruned_routes=pruned_routes,
        duplicate_routes=duplicate_routes,
        stopped_by=stopped_by,
    )


def _relevant_recipes(
    index: BreedingRecipeIndex,
    target_pal_id: str,
    max_generations: int,
) -> tuple[EffectiveBreedingRecipe, ...]:
    frontier = {target_pal_id}
    recipes: dict[str, EffectiveBreedingRecipe] = {}
    child_depths: dict[str, int] = {target_pal_id: 0}
    visited_children: set[str] = set()
    for depth in range(max_generations):
        next_frontier: set[str] = set()
        for child_pal_id in sorted(frontier - visited_children):
            visited_children.add(child_pal_id)
            for recipe in index.recipes_for_child(child_pal_id):
                recipes[recipe.signature] = recipe
                for parent_pal_id in (recipe.parent_a_pal_id, recipe.parent_b_pal_id):
                    child_depths.setdefault(parent_pal_id, depth + 1)
                    next_frontier.add(parent_pal_id)
        frontier = next_frontier
    return tuple(
        sorted(
            recipes.values(),
            key=lambda recipe: (
                child_depths[recipe.child_pal_id],
                recipe.child_pal_id,
                recipe.parent_a_pal_id,
                recipe.parent_b_pal_id,
                recipe.recipe_type,
            ),
        )
    )


def _route_rank(route: SpeciesRoute) -> tuple[int, int, int, int, str]:
    return (
        route.missing_leaf_count,
        route.generation_count,
        route.step_count,
        route.leaf_count,
        route.signature,
    )
