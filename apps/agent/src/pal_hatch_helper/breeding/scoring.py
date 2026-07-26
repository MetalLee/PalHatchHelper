from dataclasses import dataclass
from typing import Final

from pal_hatch_helper.breeding.planning import PlannedRoute, SerializedPlan
from pal_hatch_helper.generated import (
    BreedingDifficulty,
    BreedingModeScore,
    BreedingRawScoreMetrics,
    BreedingScoreBreakdown,
    BreedingScoreComponent,
    BreedingScoreComponentName,
    OptimizationMode,
)

ESTIMATE_BASIS: Final = "strategy_heuristic_no_verified_probability"

COMPONENT_ORDER: Final = (
    BreedingScoreComponentName.ROUTE_LENGTH,
    BreedingScoreComponentName.INVENTORY_COVERAGE,
    BreedingScoreComponentName.PASSIVE_CONCENTRATION,
    BreedingScoreComponentName.BORROWING,
    BreedingScoreComponentName.INTERMEDIATE_COST,
    BreedingScoreComponentName.ATTEMPT_COST,
    BreedingScoreComponentName.STABILITY,
    BreedingScoreComponentName.ACQUISITION_COST,
)

PROFILE_VERSIONS: Final = {
    OptimizationMode.BALANCED: "balanced-v6",
    OptimizationMode.FASTEST: "fastest-v6",
    OptimizationMode.HIGHEST_SUCCESS: "highest-success-v6",
    OptimizationMode.LEAST_BORROWING: "least-borrowing-v6",
}

PROFILE_WEIGHTS_BASIS_POINTS: Final = {
    OptimizationMode.BALANCED: (1400, 1400, 1200, 700, 800, 1200, 800, 2500),
    OptimizationMode.FASTEST: (4000, 800, 400, 200, 1000, 2000, 600, 1000),
    OptimizationMode.HIGHEST_SUCCESS: (400, 700, 2500, 200, 1200, 2600, 900, 1500),
    OptimizationMode.LEAST_BORROWING: (400, 500, 600, 5500, 600, 700, 500, 1200),
}


@dataclass(frozen=True, slots=True)
class ScoredPlan:
    metrics: BreedingRawScoreMetrics
    breakdown: BreedingScoreBreakdown
    inheritance_score: float


def scoring_profile_version_for(mode: OptimizationMode) -> str:
    return PROFILE_VERSIONS[mode]


def score_plan(
    plan: PlannedRoute,
    serialized: SerializedPlan,
    *,
    desired_passive_ids: tuple[str, ...],
    requested_scoring_profile_version: str,
    inventory_passive_coverage: float,
    missing_passive_count: int,
) -> ScoredPlan:
    metrics = _raw_metrics(
        plan,
        serialized,
        desired_passive_ids,
        inventory_passive_coverage=inventory_passive_coverage,
        missing_passive_count=missing_passive_count,
    )
    normalized, raw_values = _normalized_components(metrics)
    mode_scores: list[BreedingModeScore] = []
    for mode in OptimizationMode:
        components: list[BreedingScoreComponent] = []
        weighted_total_basis_points = 0
        for component, weight_basis_points in zip(
            COMPONENT_ORDER,
            PROFILE_WEIGHTS_BASIS_POINTS[mode],
            strict=True,
        ):
            normalized_basis_points = normalized[component]
            weighted_basis_points = normalized_basis_points * weight_basis_points // 10_000
            weighted_total_basis_points += weighted_basis_points
            components.append(
                BreedingScoreComponent(
                    component=component,
                    raw_value=raw_values[component],
                    normalized_score=normalized_basis_points / 100,
                    weight=weight_basis_points / 10_000,
                    weighted_score=weighted_basis_points / 100,
                )
            )
        mode_scores.append(
            BreedingModeScore(
                optimization_mode=mode,
                scoring_profile_version=PROFILE_VERSIONS[mode],
                total_score=weighted_total_basis_points / 100,
                components=components,
            )
        )
    inheritance_basis_points = (
        normalized[BreedingScoreComponentName.PASSIVE_CONCENTRATION]
        + normalized[BreedingScoreComponentName.ATTEMPT_COST]
    ) // 2
    return ScoredPlan(
        metrics=metrics,
        breakdown=BreedingScoreBreakdown(
            scoring_profile_version=requested_scoring_profile_version,
            estimate_basis=ESTIMATE_BASIS,
            raw_metrics=metrics,
            mode_scores=mode_scores,
        ),
        inheritance_score=inheritance_basis_points / 10_000,
    )


def mode_score(breakdown: BreedingScoreBreakdown, mode: OptimizationMode) -> float:
    return next(
        score.total_score for score in breakdown.mode_scores if score.optimization_mode == mode
    )


def _raw_metrics(
    plan: PlannedRoute,
    serialized: SerializedPlan,
    desired_passive_ids: tuple[str, ...],
    *,
    inventory_passive_coverage: float,
    missing_passive_count: int,
) -> BreedingRawScoreMetrics:
    steps = serialized.steps
    desired = frozenset(desired_passive_ids)
    borrowed = {
        instance.instance_uid
        for instance in serialized.unique_instances
        if any(
            source.instance_uid == instance.instance_uid and source.borrowed
            for step in steps
            for source in (step.parent_a, step.parent_b)
        )
    }
    if not steps and serialized.unique_instances:
        root = serialized.unique_instances[0]
        if plan.assigned.borrowed_instance_uids:
            borrowed.add(root.instance_uid)
    extra_passives = sum(
        len(set(instance.passive_skill_ids) - desired) for instance in serialized.unique_instances
    )
    missing_pal_count = sum(item.quantity for item in serialized.missing_requirements)
    missing_passive_requirement_count = sum(
        item.quantity * len(item.required_passive_ids) for item in serialized.missing_requirements
    )
    inventory_coverage = (
        serialized.inventory_requirement_count / serialized.starting_requirement_count
    )
    desired_count = len(desired_passive_ids)
    carrier_count = plan.carrier_count
    if desired_count == 0 or carrier_count <= 1:
        passive_concentration = 1.0
    else:
        passive_concentration = max(
            0.0,
            1 - (carrier_count - 1) / max(1, desired_count - 1),
        )
    attempts_min = 0
    attempts_max = 0
    for step in steps:
        required_count = len(step.required_passive_ids)
        minimum = (1, 1, 2, 4, 7)[required_count]
        maximum = (2, 4, 8, 16, 28)[required_count]
        immediate_extra = sum(
            len(set(source.passive_skill_ids) - desired)
            for source in (step.parent_a, step.parent_b)
            if source.source_type.value == "inventory"
        )
        minimum += immediate_extra // 2
        maximum += immediate_extra * 2
        if step.child_required_gender is not None:
            minimum *= 2
            maximum *= 2
        attempts_min += minimum
        attempts_max += maximum
    if attempts_max <= 8 and len(steps) <= 2:
        difficulty = BreedingDifficulty.LOW
    elif attempts_max <= 40 and len(steps) <= 5:
        difficulty = BreedingDifficulty.MEDIUM
    else:
        difficulty = BreedingDifficulty.HIGH
    return BreedingRawScoreMetrics(
        generation_count=plan.assigned.route.generation_count,
        step_count=len(steps),
        unique_starting_instance_count=len(serialized.unique_instances),
        starting_requirement_count=serialized.starting_requirement_count,
        missing_pal_count=missing_pal_count,
        missing_passive_requirement_count=missing_passive_requirement_count,
        missing_passive_count=missing_passive_count,
        borrowed_pal_count=len(borrowed),
        inventory_coverage=round(inventory_coverage, 6),
        inventory_passive_coverage=round(inventory_passive_coverage, 6),
        passive_carrier_count=carrier_count,
        passive_concentration=round(passive_concentration, 6),
        extra_passive_count=extra_passives,
        intermediate_pal_count=max(0, len(steps) - 1),
        intermediate_passive_checkpoint_count=plan.checkpoint_passive_count,
        required_gender_checkpoint_count=sum(
            step.child_required_gender is not None for step in steps
        ),
        estimated_attempts_min=attempts_min,
        estimated_attempts_max=attempts_max,
        difficulty=difficulty,
    )


def _normalized_components(
    metrics: BreedingRawScoreMetrics,
) -> tuple[
    dict[BreedingScoreComponentName, int],
    dict[BreedingScoreComponentName, float],
]:
    route_length = max(
        0,
        10_000 - metrics.generation_count * 1000 - max(0, metrics.step_count - 1) * 700,
    )
    inventory_coverage = round(
        min(metrics.inventory_coverage, metrics.inventory_passive_coverage) * 10_000
    )
    passive_concentration = round(metrics.passive_concentration * 10_000)
    borrowing = round(
        10_000 * (1 - metrics.borrowed_pal_count / max(1, metrics.unique_starting_instance_count))
    )
    intermediate_cost = max(
        0,
        10_000
        - metrics.intermediate_pal_count * 1200
        - metrics.intermediate_passive_checkpoint_count * 500
        - metrics.required_gender_checkpoint_count * 400,
    )
    attempt_cost = max(0, 10_000 - metrics.estimated_attempts_max * 180)
    stability_penalty = (
        metrics.intermediate_pal_count * 900
        + metrics.intermediate_passive_checkpoint_count * 500
        + metrics.required_gender_checkpoint_count * 500
        + metrics.borrowed_pal_count * 500
        + metrics.missing_pal_count * 1500
        + metrics.missing_passive_requirement_count * 500
        + metrics.missing_passive_count * 2500
    )
    stability = max(0, 10_000 - stability_penalty)
    acquisition_penalty = (
        metrics.missing_pal_count * 3000
        + metrics.missing_passive_requirement_count * 800
        + metrics.missing_passive_count * 4000
    )
    acquisition_cost = max(0, 10_000 - acquisition_penalty)
    normalized = {
        BreedingScoreComponentName.ROUTE_LENGTH: route_length,
        BreedingScoreComponentName.INVENTORY_COVERAGE: inventory_coverage,
        BreedingScoreComponentName.PASSIVE_CONCENTRATION: passive_concentration,
        BreedingScoreComponentName.BORROWING: borrowing,
        BreedingScoreComponentName.INTERMEDIATE_COST: intermediate_cost,
        BreedingScoreComponentName.ATTEMPT_COST: attempt_cost,
        BreedingScoreComponentName.STABILITY: stability,
        BreedingScoreComponentName.ACQUISITION_COST: acquisition_cost,
    }
    raw_values = {
        BreedingScoreComponentName.ROUTE_LENGTH: (
            metrics.generation_count + metrics.step_count / 100
        ),
        BreedingScoreComponentName.INVENTORY_COVERAGE: metrics.inventory_coverage,
        BreedingScoreComponentName.PASSIVE_CONCENTRATION: metrics.passive_concentration,
        BreedingScoreComponentName.BORROWING: float(metrics.borrowed_pal_count),
        BreedingScoreComponentName.INTERMEDIATE_COST: float(
            metrics.intermediate_pal_count
            + metrics.intermediate_passive_checkpoint_count
            + metrics.required_gender_checkpoint_count
        ),
        BreedingScoreComponentName.ATTEMPT_COST: float(metrics.estimated_attempts_max),
        BreedingScoreComponentName.STABILITY: float(stability_penalty),
        BreedingScoreComponentName.ACQUISITION_COST: float(acquisition_penalty),
    }
    return normalized, raw_values
