from __future__ import annotations

import json
from dataclasses import dataclass
from itertools import product
from uuid import UUID

from pal_hatch_helper.breeding.assignment import AssignedRoute, iter_inventory_instances
from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingMissingRequirement,
    BreedingParentSource,
    BreedingPassiveSource,
    BreedingRouteStep,
)


@dataclass(frozen=True, slots=True)
class PlannedRoute:
    assigned: AssignedRoute
    required_mask: int
    parent_a: PlannedRoute | None
    parent_b: PlannedRoute | None
    checkpoint_passive_count: int
    carrier_count: int
    maximum_checkpoint_size: int
    signature: str


@dataclass(frozen=True, slots=True)
class SerializedPlan:
    steps: tuple[BreedingRouteStep, ...]
    existing_target_instance_uid: str | None
    unique_instances: tuple[BreedingEngineInventoryPal, ...]
    missing_requirements: tuple[BreedingMissingRequirement, ...]
    starting_requirement_count: int
    inventory_requirement_count: int
    signature: str


def physical_plan_signature(plan: SerializedPlan) -> str:
    """Canonicalize unordered parent slots and generated step indexes."""

    if not plan.steps:
        return json.dumps(
            {"existing_target_instance_uid": plan.existing_target_instance_uid},
            sort_keys=True,
            separators=(",", ":"),
        )
    steps = {step.step_index: step for step in plan.steps}

    def source_signature(source: BreedingParentSource) -> object:
        if source.source_type.value == "intermediate":
            assert source.produced_by_step_index is not None
            return step_signature(steps[source.produced_by_step_index])
        return {
            "gender": source.gender.value if source.gender is not None else None,
            "instance_uid": source.instance_uid,
            "pal_id": source.pal_id,
            "required_passive_ids": sorted(source.required_passive_ids),
        }

    def step_signature(step: BreedingRouteStep) -> object:
        parents = [source_signature(step.parent_a), source_signature(step.parent_b)]
        parents.sort(key=lambda value: json.dumps(value, sort_keys=True, separators=(",", ":")))
        return {
            "child_pal_id": step.child_pal_id,
            "child_required_gender": (
                step.child_required_gender.value if step.child_required_gender is not None else None
            ),
            "parents": parents,
            "recipe_type": step.recipe_type,
            "required_passive_ids": sorted(step.required_passive_ids),
        }

    root = max(plan.steps, key=lambda step: step.step_index)
    return json.dumps(step_signature(root), sort_keys=True, separators=(",", ":"))


def plan_passive_retention(
    assigned: AssignedRoute,
    desired_passive_ids: tuple[str, ...],
    *,
    required_mask: int | None = None,
) -> PlannedRoute:
    full_mask = (1 << len(desired_passive_ids)) - 1
    memo: dict[tuple[str, int], PlannedRoute] = {}

    def solve(node: AssignedRoute, required_mask: int) -> PlannedRoute:
        key = (node.signature, required_mask)
        cached = memo.get(key)
        if cached is not None:
            return cached
        if node.route.recipe is None:
            if required_mask & node.coverage_mask != required_mask:
                raise ValueError("assigned inventory leaf cannot carry required passives")
            result = PlannedRoute(
                assigned=node,
                required_mask=required_mask,
                parent_a=None,
                parent_b=None,
                checkpoint_passive_count=0,
                carrier_count=int(bool(required_mask)),
                maximum_checkpoint_size=0,
                signature=f"planned:{node.signature}:required={required_mask}",
            )
            memo[key] = result
            return result

        assert node.parent_a is not None and node.parent_b is not None
        partitions = _passive_partitions(
            required_mask,
            node.parent_a.coverage_mask,
            node.parent_b.coverage_mask,
            left_generation=node.parent_a.route.generation_count,
            right_generation=node.parent_b.route.generation_count,
        )
        candidates: list[PlannedRoute] = []
        for left_mask, right_mask in partitions:
            left = solve(node.parent_a, left_mask)
            right = solve(node.parent_b, right_mask)
            left_checkpoint = left_mask.bit_count() if left.assigned.route.recipe is not None else 0
            right_checkpoint = (
                right_mask.bit_count() if right.assigned.route.recipe is not None else 0
            )
            checkpoint_count = (
                left.checkpoint_passive_count
                + right.checkpoint_passive_count
                + left_checkpoint
                + right_checkpoint
            )
            maximum_checkpoint = max(
                left.maximum_checkpoint_size,
                right.maximum_checkpoint_size,
                left_checkpoint,
                right_checkpoint,
            )
            candidates.append(
                PlannedRoute(
                    assigned=node,
                    required_mask=required_mask,
                    parent_a=left,
                    parent_b=right,
                    checkpoint_passive_count=checkpoint_count,
                    carrier_count=left.carrier_count + right.carrier_count,
                    maximum_checkpoint_size=maximum_checkpoint,
                    signature=(
                        f"planned:{node.signature}:required={required_mask}"
                        f"[{left.signature}][{right.signature}]"
                    ),
                )
            )
        if not candidates:
            raise ValueError("assigned route cannot carry all required passives")
        result = min(
            candidates,
            key=lambda item: (
                item.checkpoint_passive_count,
                item.carrier_count,
                item.maximum_checkpoint_size,
                item.signature,
            ),
        )
        memo[key] = result
        return result

    return solve(assigned, full_mask if required_mask is None else required_mask)


def serialize_plan(
    plan: PlannedRoute,
    *,
    desired_passive_ids: tuple[str, ...],
    requester_player_id: UUID,
) -> SerializedPlan:
    steps: list[BreedingRouteStep] = []

    def passive_ids(mask: int) -> list[str]:
        return [
            passive_id
            for index, passive_id in enumerate(desired_passive_ids)
            if mask & (1 << index)
        ]

    def emit(node: PlannedRoute) -> BreedingParentSource:
        assigned = node.assigned
        if assigned.instance is not None:
            instance = assigned.instance
            return BreedingParentSource(
                source_type="inventory",
                pal_id=instance.pal_id,
                instance_uid=instance.instance_uid,
                owner_player_id=instance.owner_player_id,
                guild_id=instance.guild_id,
                gender=instance.gender,
                passive_skill_ids=sorted(instance.passive_skill_ids),
                required_passive_ids=passive_ids(node.required_mask),
                borrowed=instance.owner_player_id != requester_player_id,
                produced_by_step_index=None,
                location_type=instance.location_type,
                location_name=instance.location_name,
            )

        if assigned.route.recipe is None:
            if assigned.output_gender is None:
                raise ValueError("missing starting parent must have a required gender")
            if node.required_mask:
                raise ValueError("missing starting parent cannot provide target passives")
            return BreedingParentSource(
                source_type="missing",
                pal_id=assigned.route.pal_id,
                instance_uid=None,
                owner_player_id=None,
                guild_id=None,
                gender=assigned.output_gender,
                passive_skill_ids=[],
                required_passive_ids=[],
                borrowed=False,
                produced_by_step_index=None,
                location_type=None,
                location_name=None,
            )

        assert node.parent_a is not None and node.parent_b is not None
        assert assigned.route.recipe is not None
        parent_a = emit(node.parent_a)
        parent_b = emit(node.parent_b)
        step_index = len(steps)
        required_ids = passive_ids(node.required_mask)
        steps.append(
            BreedingRouteStep(
                step_index=step_index,
                generation=assigned.route.generation_count,
                recipe_type=assigned.route.recipe.recipe_type,
                parent_a=parent_a,
                parent_b=parent_b,
                child_pal_id=assigned.route.pal_id,
                child_required_gender=assigned.output_gender,
                required_passive_ids=required_ids,
            )
        )
        return BreedingParentSource(
            source_type="intermediate",
            pal_id=assigned.route.pal_id,
            instance_uid=None,
            owner_player_id=None,
            guild_id=None,
            gender=assigned.output_gender,
            passive_skill_ids=required_ids,
            required_passive_ids=required_ids,
            borrowed=False,
            produced_by_step_index=step_index,
            location_type=None,
            location_name=None,
        )

    root_source = emit(plan)
    instances = {
        instance.instance_uid: instance for instance in iter_inventory_instances(plan.assigned)
    }
    requirement_groups: dict[tuple[str, str, tuple[str, ...]], dict[int, int]] = {}
    inventory_instance_uids: set[str] = set()
    for step in steps:
        for source in (step.parent_a, step.parent_b):
            if source.source_type.value == "intermediate":
                continue
            if source.source_type.value == "inventory":
                if source.instance_uid is None:
                    raise ValueError("inventory starting parent must have an instance UID")
                inventory_instance_uids.add(source.instance_uid)
                continue
            if source.gender is None:
                raise ValueError("missing starting parent must have a required gender")
            key = (
                source.pal_id,
                source.gender.value,
                tuple(sorted(source.required_passive_ids)),
            )
            occurrences_by_step = requirement_groups.setdefault(key, {})
            occurrences_by_step[step.step_index] = occurrences_by_step.get(step.step_index, 0) + 1
    missing_requirements = tuple(
        BreedingMissingRequirement(
            pal_id=pal_id,
            gender=gender,
            required_passive_ids=list(required_passive_ids),
            quantity=max(occurrences_by_step.values()),
            step_indexes=sorted(occurrences_by_step),
        )
        for (pal_id, gender, required_passive_ids), occurrences_by_step in sorted(
            requirement_groups.items()
        )
    )
    inventory_requirement_count = len(inventory_instance_uids)
    starting_requirement_count = inventory_requirement_count + sum(
        requirement.quantity for requirement in missing_requirements
    )
    return SerializedPlan(
        steps=tuple(steps),
        existing_target_instance_uid=(
            root_source.instance_uid if plan.assigned.instance is not None else None
        ),
        unique_instances=tuple(instances[uid] for uid in sorted(instances)),
        missing_requirements=missing_requirements,
        starting_requirement_count=starting_requirement_count,
        inventory_requirement_count=inventory_requirement_count,
        signature=plan.signature,
    )


def trace_passive_sources(
    serialized: SerializedPlan,
    desired_passive_ids: tuple[str, ...],
) -> tuple[BreedingPassiveSource, ...]:
    sources_by_passive: dict[str, BreedingPassiveSource] = {}
    desired = frozenset(desired_passive_ids)
    for step in serialized.steps:
        for parent in (step.parent_a, step.parent_b):
            if parent.source_type.value != "inventory":
                continue
            if parent.instance_uid is None:
                raise ValueError("inventory passive source must have an instance UID")
            for passive_id in sorted(set(parent.required_passive_ids) & desired):
                candidate = BreedingPassiveSource(
                    passive_id=passive_id,
                    source_instance_uid=parent.instance_uid,
                    source_pal_id=parent.pal_id,
                    first_required_step_index=step.step_index,
                )
                existing = sources_by_passive.get(passive_id)
                if existing is None or (
                    candidate.first_required_step_index,
                    candidate.source_instance_uid,
                ) < (
                    existing.first_required_step_index,
                    existing.source_instance_uid,
                ):
                    sources_by_passive[passive_id] = candidate
    return tuple(sources_by_passive[passive_id] for passive_id in sorted(sources_by_passive))


def _passive_partitions(
    required_mask: int,
    left_coverage: int,
    right_coverage: int,
    *,
    left_generation: int,
    right_generation: int,
) -> tuple[tuple[int, int], ...]:
    bits = [
        1 << index for index in range(required_mask.bit_length()) if required_mask & (1 << index)
    ]
    choices: list[tuple[str, ...]] = []
    for bit in bits:
        available: list[str] = []
        if left_coverage & bit:
            available.append("left")
        if right_coverage & bit:
            available.append("right")
        if not available:
            return ()
        if len(available) == 2 and left_generation != right_generation:
            available = ["left" if left_generation > right_generation else "right"]
        choices.append(tuple(available))
    partitions: set[tuple[int, int]] = set()
    for allocation in product(*choices):
        left_mask = 0
        right_mask = 0
        for bit, side in zip(bits, allocation, strict=True):
            if side == "left":
                left_mask |= bit
            else:
                right_mask |= bit
        partitions.add((left_mask, right_mask))
    if not bits:
        partitions.add((0, 0))
    return tuple(sorted(partitions))
