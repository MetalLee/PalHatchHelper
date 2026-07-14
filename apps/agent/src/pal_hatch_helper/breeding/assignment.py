from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal
from uuid import UUID

from pal_hatch_helper.breeding.limits import SearchBudget
from pal_hatch_helper.breeding.search import SpeciesRoute
from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingSearchLimit,
)

RequiredGender = Literal["male", "female"]


@dataclass(frozen=True, slots=True)
class AssignedRoute:
    route: SpeciesRoute
    output_gender: RequiredGender | None
    instance: BreedingEngineInventoryPal | None
    parent_a: AssignedRoute | None
    parent_b: AssignedRoute | None
    coverage_mask: int
    used_instance_uids: frozenset[str]
    borrowed_instance_uids: frozenset[str]
    signature: str

    @property
    def is_leaf(self) -> bool:
        return self.instance is not None


@dataclass(frozen=True, slots=True)
class AssignmentResult:
    assignments: tuple[AssignedRoute, ...]
    pruned_states: int


def assign_species_route(
    route: SpeciesRoute,
    *,
    inventory_by_species: dict[str, tuple[BreedingEngineInventoryPal, ...]],
    desired_passive_ids: tuple[str, ...],
    requester_player_id: UUID,
    max_states_per_mask: int,
    budget: SearchBudget,
) -> AssignmentResult:
    passive_bits = {passive_id: 1 << index for index, passive_id in enumerate(desired_passive_ids)}
    full_mask = (1 << len(desired_passive_ids)) - 1
    memo: dict[tuple[str, RequiredGender | None], tuple[AssignedRoute, ...]] = {}
    pruned_states = 0

    def retain(states: list[AssignedRoute]) -> tuple[AssignedRoute, ...]:
        nonlocal pruned_states
        grouped: dict[int, dict[str, AssignedRoute]] = defaultdict(dict)
        for state in states:
            grouped[state.coverage_mask].setdefault(state.signature, state)
        retained: list[AssignedRoute] = []
        for mask in sorted(grouped):
            ordered = sorted(
                grouped[mask].values(),
                key=lambda state: _assignment_rank(state, desired_passive_ids),
            )
            retained.extend(ordered[:max_states_per_mask])
            dropped = max(0, len(ordered) - max_states_per_mask)
            if dropped:
                pruned_states += dropped
                budget.mark_limit(BreedingSearchLimit.ASSIGNMENT_STATE_CAP)
        return tuple(sorted(retained, key=lambda state: (state.coverage_mask, state.signature)))

    def solve(
        node: SpeciesRoute,
        output_gender: RequiredGender | None,
    ) -> tuple[AssignedRoute, ...]:
        key = (node.signature, output_gender)
        cached = memo.get(key)
        if cached is not None:
            return cached
        if node.recipe is None:
            states: list[AssignedRoute] = []
            for instance in inventory_by_species.get(node.pal_id, ()):
                if output_gender is not None and instance.gender.value != output_gender:
                    continue
                budget.consume_assignment()
                coverage_mask = 0
                for passive_id in instance.passive_skill_ids:
                    coverage_mask |= passive_bits.get(passive_id, 0)
                borrowed = instance.owner_player_id != requester_player_id
                states.append(
                    AssignedRoute(
                        route=node,
                        output_gender=output_gender,
                        instance=instance,
                        parent_a=None,
                        parent_b=None,
                        coverage_mask=coverage_mask,
                        used_instance_uids=frozenset((instance.instance_uid,)),
                        borrowed_instance_uids=(
                            frozenset((instance.instance_uid,)) if borrowed else frozenset()
                        ),
                        signature=(
                            f"inventory:{node.pal_id}:{instance.instance_uid}:"
                            f"{output_gender or 'unused'}"
                        ),
                    )
                )
            result = retain(states)
            memo[key] = result
            return result

        assert node.parent_a is not None and node.parent_b is not None
        combined: list[AssignedRoute] = []
        orientations: tuple[tuple[RequiredGender, RequiredGender], ...] = (
            ("male", "female"),
            ("female", "male"),
        )
        if node.parent_a.signature == node.parent_b.signature:
            orientations = orientations[:1]
        for left_gender, right_gender in orientations:
            left_states = solve(node.parent_a, left_gender)
            right_states = solve(node.parent_b, right_gender)
            for left in left_states:
                for right in right_states:
                    budget.consume_assignment()
                    if (
                        left.instance is not None
                        and right.instance is not None
                        and left.instance.instance_uid == right.instance.instance_uid
                    ):
                        continue
                    combined.append(
                        AssignedRoute(
                            route=node,
                            output_gender=output_gender,
                            instance=None,
                            parent_a=left,
                            parent_b=right,
                            coverage_mask=left.coverage_mask | right.coverage_mask,
                            used_instance_uids=(left.used_instance_uids | right.used_instance_uids),
                            borrowed_instance_uids=(
                                left.borrowed_instance_uids | right.borrowed_instance_uids
                            ),
                            signature=(
                                f"assigned:{node.recipe.signature}:"
                                f"{output_gender or 'final'}[{left.signature}][{right.signature}]"
                            ),
                        )
                    )
        result = retain(combined)
        memo[key] = result
        return result

    assignments = tuple(
        state for state in solve(route, None) if state.coverage_mask & full_mask == full_mask
    )
    return AssignmentResult(
        assignments=tuple(
            sorted(assignments, key=lambda state: _assignment_rank(state, desired_passive_ids))
        ),
        pruned_states=pruned_states,
    )


def iter_inventory_instances(route: AssignedRoute) -> tuple[BreedingEngineInventoryPal, ...]:
    if route.instance is not None:
        return (route.instance,)
    assert route.parent_a is not None and route.parent_b is not None
    return (*iter_inventory_instances(route.parent_a), *iter_inventory_instances(route.parent_b))


def _assignment_rank(
    state: AssignedRoute,
    desired_passive_ids: tuple[str, ...],
) -> tuple[int, int, int, str]:
    desired = frozenset(desired_passive_ids)
    unique_instances = {
        instance.instance_uid: instance for instance in iter_inventory_instances(state)
    }
    extra_passives = sum(
        len(set(instance.passive_skill_ids) - desired) for instance in unique_instances.values()
    )
    return (
        len(state.borrowed_instance_uids),
        extra_passives,
        len(state.used_instance_uids),
        state.signature,
    )
