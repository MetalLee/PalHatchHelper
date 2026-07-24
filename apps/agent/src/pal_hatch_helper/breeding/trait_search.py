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
    target_goal_reached: bool


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
    target_state_goal: int,
    include_missing_leaves: bool,
    budget: SearchBudget,
) -> TraitSearchResult:
    """Search inventory instances, target-passive masks, and output genders together."""

    passive_bits = {passive_id: 1 << index for index, passive_id in enumerate(desired_passive_ids)}
    relevant, distance_to_target = _relevant_recipes(index, target_pal_id, max_generations)
    buckets: dict[StateKey, list[AssignedRoute]] = {}
    bucket_signatures: dict[StateKey, set[str]] = {}
    costs_by_signature: dict[str, tuple[int, ...]] = {}
    pruned_states = 0
    duplicate_states = 0
    stopped_by: BreedingSearchLimit | None = None
    target_goal_reached = False

    def retain(state: AssignedRoute) -> None:
        nonlocal pruned_states, duplicate_states
        assert state.output_gender is not None
        key: StateKey = (state.route.pal_id, state.coverage_mask, state.output_gender)
        bucket = buckets.setdefault(key, [])
        signatures = bucket_signatures.setdefault(key, set())
        if state.signature in signatures:
            duplicate_states += 1
            return
        state_cost = _pareto_cost(state, desired_passive_ids)
        costs_by_signature[state.signature] = state_cost
        if len(bucket) < max_states_per_state:
            bucket.append(state)
            signatures.add(state.signature)
            return

        existing_costs = [costs_by_signature[item.signature] for item in bucket]
        dominated_indexes = [
            index
            for index, existing_cost in enumerate(existing_costs)
            if _dominates(state_cost, existing_cost)
        ]
        if not dominated_indexes and any(
            _dominates(existing_cost, state_cost) for existing_cost in existing_costs
        ):
            pruned_states += 1
            costs_by_signature.pop(state.signature, None)
            return
        if dominated_indexes:
            victim_index = max(
                dominated_indexes,
                key=lambda index: (existing_costs[index], bucket[index].signature),
            )
        else:
            ranked = [*bucket, state]
            victim = max(
                ranked,
                key=lambda item: (costs_by_signature[item.signature], item.signature),
            )
            if victim is state:
                pruned_states += 1
                costs_by_signature.pop(state.signature, None)
                return
            victim_index = bucket.index(victim)
        victim = bucket[victim_index]
        signatures.remove(victim.signature)
        costs_by_signature.pop(victim.signature, None)
        bucket[victim_index] = state
        signatures.add(state.signature)
        pruned_states += 1

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
            grouped: dict[tuple[str, OutputGender], list[AssignedRoute]] = {}
            for (pal_id, _, gender), states in snapshot.items():
                values = grouped.setdefault((pal_id, gender), [])
                values.extend(
                    state for state in states if state.route.generation_count < generation
                )
            by_species_gender = {
                key: tuple(sorted(values, key=lambda item: item.signature))
                for key, values in grouped.items()
            }

            recipe_priorities: dict[str, tuple[int, int, str]] = {}
            for candidate_recipe in relevant:
                potential_mask = 0
                for left_gender, right_gender in _recipe_orientations(candidate_recipe):
                    left_mask = 0
                    for state in by_species_gender.get(
                        (candidate_recipe.parent_a_pal_id, left_gender), ()
                    ):
                        left_mask |= state.coverage_mask
                    right_mask = 0
                    for state in by_species_gender.get(
                        (candidate_recipe.parent_b_pal_id, right_gender), ()
                    ):
                        right_mask |= state.coverage_mask
                    potential_mask = max(
                        potential_mask,
                        left_mask | right_mask,
                        key=int.bit_count,
                    )
                recipe_priorities[candidate_recipe.signature] = (
                    distance_to_target.get(candidate_recipe.child_pal_id, max_generations + 1),
                    -potential_mask.bit_count(),
                    candidate_recipe.signature,
                )

            expanded_this_generation = 0
            generation_capped = False
            for recipe in sorted(
                relevant,
                key=lambda item: recipe_priorities[item.signature],
            ):
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
                            if recipe.child_pal_id == target_pal_id and _target_goal_met(
                                buckets,
                                target_pal_id=target_pal_id,
                                required_mask=required_mask,
                                target_state_goal=target_state_goal,
                            ):
                                target_goal_reached = True
                                break
                        if target_goal_reached:
                            break
                        if generation_capped:
                            break
                    if target_goal_reached:
                        break
                    if generation_capped:
                        break
                if target_goal_reached:
                    break
                if generation_capped:
                    break
            if target_goal_reached:
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
        target_goal_reached=target_goal_reached,
    )


def _relevant_recipes(
    index: BreedingRecipeIndex,
    target_pal_id: str,
    max_generations: int,
) -> tuple[tuple[EffectiveBreedingRecipe, ...], dict[str, int]]:
    frontier = {target_pal_id}
    visited: set[str] = set()
    recipes: dict[str, EffectiveBreedingRecipe] = {}
    distance_to_target = {target_pal_id: 0}
    for depth in range(max_generations):
        next_frontier: set[str] = set()
        for child_pal_id in sorted(frontier - visited):
            visited.add(child_pal_id)
            for recipe in index.recipes_for_child(child_pal_id):
                recipes[recipe.signature] = recipe
                next_frontier.update((recipe.parent_a_pal_id, recipe.parent_b_pal_id))
                distance_to_target.setdefault(recipe.parent_a_pal_id, depth + 1)
                distance_to_target.setdefault(recipe.parent_b_pal_id, depth + 1)
        frontier = next_frontier
    return tuple(sorted(recipes.values(), key=lambda item: item.signature)), distance_to_target


def _target_goal_met(
    buckets: dict[StateKey, list[AssignedRoute]],
    *,
    target_pal_id: str,
    required_mask: int,
    target_state_goal: int,
) -> bool:
    target_states = [
        state
        for (pal_id, mask, _), states in buckets.items()
        if pal_id == target_pal_id and mask & required_mask == required_mask
        for state in states
    ]
    return len(target_states) >= max(1, target_state_goal) and any(
        state.missing_leaf_count == 0 and not state.borrowed_instance_uids
        for state in target_states
    )


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
