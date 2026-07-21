from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, cast
from uuid import UUID

from pal_hatch_helper.breeding.assignment import AssignedRoute, iter_inventory_instances
from pal_hatch_helper.breeding.index import BreedingRecipeIndex, EffectiveBreedingRecipe
from pal_hatch_helper.breeding.limits import SearchBudget, SearchStopped
from pal_hatch_helper.breeding.search import SpeciesRoute
from pal_hatch_helper.generated import BreedingEngineInventoryPal, BreedingSearchLimit

OutputGender = Literal["male", "female"]
StateKey = tuple[str, int, OutputGender]


@dataclass(frozen=True, slots=True)
class TraitSearchResult:
    assignments: tuple[AssignedRoute, ...]
    pruned_states: int
    duplicate_states: int
    stopped_by: BreedingSearchLimit | None


def search_trait_routes(
    index: BreedingRecipeIndex,
    *,
    inventory_by_species: dict[str, tuple[BreedingEngineInventoryPal, ...]],
    desired_passive_ids: tuple[str, ...],
    requester_player_id: UUID,
    target_pal_id: str,
    required_mask: int,
    max_generations: int,
    max_states_per_state: int,
    max_frontier_expansions: int,
    include_missing_leaves: bool,
    budget: SearchBudget,
) -> TraitSearchResult:
    """Search inventory instances, target-passive masks, and output genders together."""

    passive_bits = {passive_id: 1 << index for index, passive_id in enumerate(desired_passive_ids)}
    relevant = _relevant_recipes(index, target_pal_id, max_generations)
    buckets: dict[StateKey, list[AssignedRoute]] = {}
    pruned_states = 0
    duplicate_states = 0
    stopped_by: BreedingSearchLimit | None = None

    def retain(state: AssignedRoute) -> None:
        nonlocal pruned_states, duplicate_states
        assert state.output_gender is not None
        key: StateKey = (state.route.pal_id, state.coverage_mask, state.output_gender)
        bucket = buckets.setdefault(key, [])
        if any(existing.signature == state.signature for existing in bucket):
            duplicate_states += 1
            return
        bucket.append(state)
        if len(bucket) > max_states_per_state:
            costs = {
                candidate.signature: _pareto_cost(candidate, desired_passive_ids)
                for candidate in bucket
            }
            bucket.sort(
                key=lambda candidate: (
                    sum(
                        _dominates(costs[other.signature], costs[candidate.signature])
                        for other in bucket
                        if other is not candidate
                    ),
                    costs[candidate.signature],
                    candidate.signature,
                )
            )
            dropped = len(bucket) - max_states_per_state
            pruned_states += dropped
            del bucket[max_states_per_state:]

    for pal_id in sorted(inventory_by_species):
        leaf = SpeciesRoute.leaf(pal_id)
        for instance in inventory_by_species[pal_id]:
            if instance.gender.value not in ("male", "female"):
                continue
            coverage_mask = 0
            for passive_id in instance.passive_skill_ids:
                coverage_mask |= passive_bits.get(passive_id, 0)
            gender = cast(OutputGender, instance.gender.value)
            borrowed = instance.owner_player_id != requester_player_id
            retain(
                AssignedRoute(
                    route=leaf,
                    output_gender=gender,
                    instance=instance,
                    parent_a=None,
                    parent_b=None,
                    coverage_mask=coverage_mask,
                    used_instance_uids=frozenset((instance.instance_uid,)),
                    borrowed_instance_uids=(
                        frozenset((instance.instance_uid,)) if borrowed else frozenset()
                    ),
                    missing_leaf_count=0,
                    signature=f"inventory:{pal_id}:{instance.instance_uid}:{gender}",
                )
            )

    if include_missing_leaves:
        missing_species = {
            pal_id
            for recipe in relevant
            for pal_id in (recipe.parent_a_pal_id, recipe.parent_b_pal_id)
        }
        for pal_id in sorted(missing_species):
            leaf = SpeciesRoute.leaf(pal_id, missing=True)
            for gender in ("female", "male"):
                retain(
                    AssignedRoute(
                        route=leaf,
                        output_gender=gender,
                        instance=None,
                        parent_a=None,
                        parent_b=None,
                        coverage_mask=0,
                        used_instance_uids=frozenset(),
                        borrowed_instance_uids=frozenset(),
                        missing_leaf_count=1,
                        signature=f"missing:{pal_id}:{gender}",
                    )
                )

    try:
        for generation in range(1, max_generations + 1):
            snapshot = {key: tuple(states) for key, states in buckets.items()}
            by_species_gender: dict[tuple[str, OutputGender], tuple[AssignedRoute, ...]] = {}
            for pal_id, _, gender in sorted(snapshot):
                key = (pal_id, gender)
                if key in by_species_gender:
                    continue
                values = [
                    state
                    for (candidate_pal, _, candidate_gender), states in snapshot.items()
                    if candidate_pal == pal_id and candidate_gender == gender
                    for state in states
                    if state.route.generation_count < generation
                ]
                by_species_gender[key] = tuple(sorted(values, key=lambda item: item.signature))

            expanded_this_generation = 0
            generation_capped = False
            for recipe in relevant:
                for left_gender, right_gender in _recipe_orientations(recipe):
                    left_states = by_species_gender.get((recipe.parent_a_pal_id, left_gender), ())
                    right_states = by_species_gender.get((recipe.parent_b_pal_id, right_gender), ())
                    for left in left_states:
                        for right in right_states:
                            if (
                                1
                                + max(
                                    left.route.generation_count,
                                    right.route.generation_count,
                                )
                                != generation
                            ):
                                continue
                            if expanded_this_generation >= max_frontier_expansions:
                                pruned_states += 1
                                generation_capped = True
                                break
                            if _same_immediate_instance(left, right):
                                continue
                            if (
                                recipe.parent_a_pal_id == recipe.parent_b_pal_id
                                and recipe.parent_a_gender == "any"
                                and recipe.parent_b_gender == "any"
                                and left.signature >= right.signature
                            ):
                                continue
                            route = SpeciesRoute.combine(recipe, left.route, right.route)
                            parent_a, parent_b = _ordered_parents(recipe, route, left, right)
                            for output_gender in ("female", "male"):
                                budget.consume_species()
                                expanded_this_generation += 1
                                retain(
                                    AssignedRoute(
                                        route=route,
                                        output_gender=output_gender,
                                        instance=None,
                                        parent_a=parent_a,
                                        parent_b=parent_b,
                                        coverage_mask=(
                                            parent_a.coverage_mask | parent_b.coverage_mask
                                        ),
                                        used_instance_uids=(
                                            parent_a.used_instance_uids
                                            | parent_b.used_instance_uids
                                        ),
                                        borrowed_instance_uids=(
                                            parent_a.borrowed_instance_uids
                                            | parent_b.borrowed_instance_uids
                                        ),
                                        missing_leaf_count=(
                                            parent_a.missing_leaf_count
                                            + parent_b.missing_leaf_count
                                        ),
                                        signature=(
                                            f"trait:{recipe.signature}:{output_gender}"
                                            f"[{parent_a.signature}][{parent_b.signature}]"
                                        ),
                                    )
                                )
                        if generation_capped:
                            break
                    if generation_capped:
                        break
                if generation_capped:
                    break
    except SearchStopped as stopped:
        stopped_by = stopped.limit

    target_states = [
        state
        for (pal_id, mask, _), states in buckets.items()
        if pal_id == target_pal_id and mask & required_mask == required_mask
        for state in states
        if state.route.recipe is not None
    ]
    assignments = tuple(
        _as_final_output(state)
        for state in sorted(
            target_states,
            key=lambda item: (_pareto_cost(item, desired_passive_ids), item.signature),
        )
    )
    return TraitSearchResult(
        assignments=assignments,
        pruned_states=pruned_states,
        duplicate_states=duplicate_states,
        stopped_by=stopped_by,
    )


def _relevant_recipes(
    index: BreedingRecipeIndex,
    target_pal_id: str,
    max_generations: int,
) -> tuple[EffectiveBreedingRecipe, ...]:
    frontier = {target_pal_id}
    visited: set[str] = set()
    recipes: dict[str, EffectiveBreedingRecipe] = {}
    for _ in range(max_generations):
        next_frontier: set[str] = set()
        for child_pal_id in sorted(frontier - visited):
            visited.add(child_pal_id)
            for recipe in index.recipes_for_child(child_pal_id):
                recipes[recipe.signature] = recipe
                next_frontier.update((recipe.parent_a_pal_id, recipe.parent_b_pal_id))
        frontier = next_frontier
    return tuple(sorted(recipes.values(), key=lambda item: item.signature))


def _recipe_orientations(
    recipe: EffectiveBreedingRecipe,
) -> tuple[tuple[OutputGender, OutputGender], ...]:
    orientations: tuple[tuple[OutputGender, OutputGender], ...] = (
        ("female", "male"),
        ("male", "female"),
    )
    return tuple(
        (left, right)
        for left, right in orientations
        if recipe.parent_a_gender in ("any", left) and recipe.parent_b_gender in ("any", right)
    )


def _same_immediate_instance(left: AssignedRoute, right: AssignedRoute) -> bool:
    return (
        left.instance is not None
        and right.instance is not None
        and left.instance.instance_uid == right.instance.instance_uid
    )


def _ordered_parents(
    recipe: EffectiveBreedingRecipe,
    route: SpeciesRoute,
    left: AssignedRoute,
    right: AssignedRoute,
) -> tuple[AssignedRoute, AssignedRoute]:
    if recipe.parent_a_pal_id != recipe.parent_b_pal_id:
        return (left, right) if route.parent_a is left.route else (right, left)
    if recipe.parent_a_gender != "any" or recipe.parent_b_gender != "any":
        return left, right
    return tuple(sorted((left, right), key=lambda item: item.signature))  # type: ignore[return-value]


def _as_final_output(state: AssignedRoute) -> AssignedRoute:
    return AssignedRoute(
        route=state.route,
        output_gender=None,
        instance=None,
        parent_a=state.parent_a,
        parent_b=state.parent_b,
        coverage_mask=state.coverage_mask,
        used_instance_uids=state.used_instance_uids,
        borrowed_instance_uids=state.borrowed_instance_uids,
        missing_leaf_count=state.missing_leaf_count,
        signature=f"final:{state.signature}",
    )


def _pareto_cost(
    state: AssignedRoute,
    desired_passive_ids: tuple[str, ...],
) -> tuple[int, int, int, int, int, int, int, int]:
    desired = frozenset(desired_passive_ids)
    instances = {instance.instance_uid: instance for instance in iter_inventory_instances(state)}
    extra_passives = sum(
        len(set(instance.passive_skill_ids) - desired) for instance in instances.values()
    )
    checkpoint_estimate = max(0, state.route.step_count - 1) * state.coverage_mask.bit_count()
    attempt_estimate = state.route.step_count * (1 + state.coverage_mask.bit_count())
    return (
        state.missing_leaf_count,
        state.route.generation_count,
        state.route.step_count,
        attempt_estimate,
        len(state.borrowed_instance_uids),
        extra_passives,
        checkpoint_estimate,
        len(state.used_instance_uids),
    )


def _dominates(left: tuple[int, ...], right: tuple[int, ...]) -> bool:
    return all(a <= b for a, b in zip(left, right, strict=True)) and any(
        a < b for a, b in zip(left, right, strict=True)
    )
