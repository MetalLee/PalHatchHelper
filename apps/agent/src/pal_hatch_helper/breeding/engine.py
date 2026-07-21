import hashlib
import json
import time
from collections import defaultdict
from collections.abc import Callable
from typing import Final, cast

from pal_hatch_helper.breeding.assignment import AssignedRoute
from pal_hatch_helper.breeding.facts import BreedingRuntimeFacts
from pal_hatch_helper.breeding.index import BreedingRecipeIndex, ConcreteGender
from pal_hatch_helper.breeding.inventory import select_eligible_inventory
from pal_hatch_helper.breeding.limits import SearchBudget
from pal_hatch_helper.breeding.planning import (
    physical_plan_signature,
    plan_passive_retention,
    serialize_plan,
    trace_passive_sources,
)
from pal_hatch_helper.breeding.scoring import (
    PROFILE_VERSIONS,
    mode_score,
    score_plan,
)
from pal_hatch_helper.breeding.trait_search import TraitSearchResult, search_trait_routes
from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingEngineRequest,
    BreedingEngineResult,
    BreedingFeasibilityStatus,
    BreedingInventoryExclusion,
    BreedingModeRanking,
    BreedingRouteCandidate,
    BreedingRouteStep,
    BreedingSearchDiagnostics,
    BreedingSearchLimit,
    OptimizationMode,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

ALGORITHM_VERSION: Final = "inventory-trait-aware-deterministic-v4"


class DeterministicBreedingEngine:
    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock

    def search(
        self,
        request: BreedingEngineRequest,
        facts: BreedingRuntimeFacts,
    ) -> BreedingEngineResult:
        _validate_versions(request)
        _validate_runtime_facts(request, facts)
        desired_passive_ids = tuple(sorted(request.desired_passive_ids))
        index = BreedingRecipeIndex.build(facts.catalog.recipes)
        inventory_selection = select_eligible_inventory(request)
        inventory_by_species_lists: dict[str, list[BreedingEngineInventoryPal]] = defaultdict(list)
        for instance in inventory_selection.eligible:
            inventory_by_species_lists[instance.pal_id].append(instance)
        inventory_by_species = {
            pal_id: tuple(sorted(instances, key=lambda item: item.instance_uid))
            for pal_id, instances in inventory_by_species_lists.items()
        }
        passive_bits = {
            passive_id: 1 << index for index, passive_id in enumerate(desired_passive_ids)
        }
        full_mask = (1 << len(desired_passive_ids)) - 1
        available_passives = {
            passive_id
            for instance in inventory_selection.eligible
            for passive_id in instance.passive_skill_ids
            if passive_id in passive_bits
        }
        missing_passive_ids = tuple(
            passive_id for passive_id in desired_passive_ids if passive_id not in available_passives
        )
        available_mask = full_mask
        for passive_id in missing_passive_ids:
            available_mask &= ~passive_bits[passive_id]

        budget = SearchBudget(
            max_expanded_nodes=request.limits.max_expanded_nodes,
            timeout_ms=request.limits.timeout_ms,
            clock=self._clock,
        )
        ready_result = (
            search_trait_routes(
                index,
                inventory_by_species=inventory_by_species,
                desired_passive_ids=desired_passive_ids,
                requester_player_id=request.requester_player_id,
                target_pal_id=request.target_pal_id,
                required_mask=full_mask,
                max_generations=request.limits.max_generations,
                max_states_per_state=request.limits.max_assignment_states_per_mask,
                max_frontier_expansions=max(32, request.limits.max_species_routes_per_pal * 32),
                target_state_goal=8,
                include_missing_leaves=False,
                budget=budget,
            )
            if not missing_passive_ids
            else TraitSearchResult((), 0, 0, None, False)
        )

        physical_plan_keys: set[str] = set()
        pruned_physical_duplicates = 0

        def collect_candidates(
            assignments: tuple[AssignedRoute, ...],
            *,
            required_mask: int,
            fallback: bool,
        ) -> dict[str, BreedingRouteCandidate]:
            nonlocal pruned_physical_duplicates
            candidates: dict[str, BreedingRouteCandidate] = {}
            for assignment in assignments:
                is_fallback = bool(assignment.missing_leaf_count or missing_passive_ids)
                if is_fallback != fallback:
                    continue
                planned = plan_passive_retention(
                    assignment,
                    desired_passive_ids,
                    required_mask=required_mask,
                )
                serialized = serialize_plan(
                    planned,
                    desired_passive_ids=desired_passive_ids,
                    requester_player_id=request.requester_player_id,
                )
                if any(
                    requirement.required_passive_ids
                    for requirement in serialized.missing_requirements
                ):
                    raise RuntimeError("missing inventory requirements cannot provide passives")
                physical_key = physical_plan_signature(serialized)
                if physical_key in physical_plan_keys:
                    pruned_physical_duplicates += 1
                    continue
                if len(candidates) >= request.limits.max_candidate_routes:
                    break
                _validate_serialized_relations(index, serialized.steps)
                passive_sources = trace_passive_sources(serialized, desired_passive_ids)
                inventory_passive_coverage = (
                    1.0
                    if not desired_passive_ids
                    else len(passive_sources) / len(desired_passive_ids)
                )
                if not fallback and inventory_passive_coverage != 1:
                    raise RuntimeError("ready route passives must all trace to inventory")
                scored = score_plan(
                    planned,
                    serialized,
                    desired_passive_ids=desired_passive_ids,
                    requested_scoring_profile_version=request.scoring_profile_version,
                    inventory_passive_coverage=inventory_passive_coverage,
                    missing_passive_count=len(missing_passive_ids),
                )
                route_key = _route_key(request, physical_key)
                physical_plan_keys.add(physical_key)
                candidates[route_key] = BreedingRouteCandidate(
                    route_key=route_key,
                    rank=1,
                    optimization_mode=request.optimization_mode,
                    total_score=mode_score(scored.breakdown, request.optimization_mode),
                    generation_count=scored.metrics.generation_count,
                    step_count=scored.metrics.step_count,
                    estimated_attempts_min=scored.metrics.estimated_attempts_min,
                    estimated_attempts_max=scored.metrics.estimated_attempts_max,
                    difficulty=scored.metrics.difficulty,
                    borrowed_pal_count=scored.metrics.borrowed_pal_count,
                    inventory_coverage=scored.metrics.inventory_coverage,
                    inventory_passive_coverage=inventory_passive_coverage,
                    inheritance_score=scored.inheritance_score,
                    feasibility_status=(
                        BreedingFeasibilityStatus.NEEDS_INVENTORY
                        if fallback
                        else BreedingFeasibilityStatus.READY
                    ),
                    adoptable=not fallback,
                    missing_pal_count=sum(
                        item.quantity for item in serialized.missing_requirements
                    ),
                    missing_passive_ids=list(missing_passive_ids),
                    missing_requirements=list(serialized.missing_requirements),
                    passive_sources=list(passive_sources),
                    existing_target_instance_uid=serialized.existing_target_instance_uid,
                    score_breakdown=scored.breakdown,
                    steps=list(serialized.steps),
                )
            return candidates

        ready_candidates = collect_candidates(
            ready_result.assignments,
            required_mask=full_mask,
            fallback=False,
        )
        fallback_result = TraitSearchResult((), 0, 0, None, False)
        fallback_candidates: dict[str, BreedingRouteCandidate] = {}
        if (
            len(ready_candidates) < request.limits.max_results
            and ready_result.stopped_by is None
            and not ready_result.target_goal_reached
        ):
            fallback_result = search_trait_routes(
                index,
                inventory_by_species=inventory_by_species,
                desired_passive_ids=desired_passive_ids,
                requester_player_id=request.requester_player_id,
                target_pal_id=request.target_pal_id,
                required_mask=available_mask,
                max_generations=request.limits.max_generations,
                max_states_per_state=request.limits.max_assignment_states_per_mask,
                max_frontier_expansions=max(32, request.limits.max_species_routes_per_pal * 32),
                target_state_goal=8,
                include_missing_leaves=True,
                budget=budget,
            )
            fallback_candidates = collect_candidates(
                fallback_result.assignments,
                required_mask=available_mask,
                fallback=True,
            )

        candidates_by_key = {**ready_candidates, **fallback_candidates}
        all_candidates = tuple(candidates_by_key.values())
        stopped_by = ready_result.stopped_by or fallback_result.stopped_by
        requested_order = sorted(
            all_candidates,
            key=lambda candidate: _candidate_rank(candidate, request.optimization_mode),
        )
        selected_route_keys = {
            ordered[0].route_key
            for mode in OptimizationMode
            if (ordered := sorted(all_candidates, key=lambda item: _candidate_rank(item, mode)))
        }
        for candidate in requested_order:
            if len(selected_route_keys) >= request.limits.max_results:
                break
            selected_route_keys.add(candidate.route_key)
        selected = sorted(
            (
                candidate
                for candidate in all_candidates
                if candidate.route_key in selected_route_keys
            ),
            key=lambda candidate: _candidate_rank(candidate, request.optimization_mode),
        )
        returned = [
            candidate.model_copy(update={"rank": rank})
            for rank, candidate in enumerate(
                selected,
                start=1,
            )
        ]
        hit_limits = budget.hit_limits
        search_complete = not hit_limits and stopped_by is None
        pruned_trait_states = ready_result.pruned_states + fallback_result.pruned_states
        soft_pruned = bool(
            pruned_trait_states
            or len(ready_candidates) >= request.limits.max_candidate_routes
            or len(fallback_candidates) >= request.limits.max_candidate_routes
        )
        returned_all = (
            search_complete
            and not soft_pruned
            and not ready_result.target_goal_reached
            and not fallback_result.target_goal_reached
            and len(all_candidates) <= request.limits.max_results
        )
        diagnostics = BreedingSearchDiagnostics(
            graph_pal_count=len(index.graph_pals | frozenset(inventory_by_species)),
            effective_recipe_count=index.effective_recipe_count,
            inventory_input_count=len(request.inventory),
            eligible_inventory_count=len(inventory_selection.eligible),
            excluded_inventory_count=(len(request.inventory) - len(inventory_selection.eligible)),
            exclusions=[
                BreedingInventoryExclusion(reason=reason, count=count)
                for reason, count in inventory_selection.exclusions
            ],
            expanded_species_nodes=budget.expanded_species_nodes,
            expanded_assignment_nodes=budget.expanded_assignment_nodes,
            expanded_nodes=budget.expanded_nodes,
            pruned_species_routes=0,
            pruned_assignment_states=pruned_trait_states,
            pruned_duplicate_routes=(
                ready_result.duplicate_states
                + fallback_result.duplicate_states
                + pruned_physical_duplicates
            ),
            candidate_routes_evaluated=len(all_candidates),
            search_complete=search_complete,
            returned_all_legal_routes=returned_all,
            hit_limits=list(hit_limits),
        )
        result = BreedingEngineResult(
            target_pal_id=request.target_pal_id,
            desired_passive_ids=list(desired_passive_ids),
            inventory_snapshot_id=request.inventory_snapshot_id,
            game_data_version_id=request.game_data_version_id,
            game_data_content_hash=request.game_data_content_hash,
            algorithm_version=request.algorithm_version,
            scoring_profile_version=request.scoring_profile_version,
            optimization_mode=request.optimization_mode,
            missing_passive_ids=list(missing_passive_ids),
            routes=returned,
            mode_rankings=_mode_rankings(returned),
            explanation_codes=_explanation_codes(
                returned_count=len(returned),
                returned_all=returned_all,
                hit_limits=hit_limits,
                soft_pruned=soft_pruned,
                missing_passive_ids=missing_passive_ids,
            ),
            diagnostics=diagnostics,
            result_digest="0" * 64,
        )
        return result.model_copy(update={"result_digest": _result_digest(result)})


def scoring_profile_version_for(mode: OptimizationMode) -> str:
    return PROFILE_VERSIONS[mode]


def _validate_versions(request: BreedingEngineRequest) -> None:
    if request.algorithm_version != ALGORITHM_VERSION:
        raise StructuredError(
            code=ErrorCode.BREEDING_ALGORITHM_VERSION_UNSUPPORTED,
            summary="The fixed breeding algorithm version is not supported.",
            retryable=False,
        )
    expected_profile = scoring_profile_version_for(request.optimization_mode)
    if request.scoring_profile_version != expected_profile:
        raise StructuredError(
            code=ErrorCode.BREEDING_SCORING_PROFILE_UNSUPPORTED,
            summary="The fixed scoring profile is unsupported or does not match the mode.",
            retryable=False,
        )


def _validate_runtime_facts(
    request: BreedingEngineRequest,
    facts: BreedingRuntimeFacts,
) -> None:
    if facts.catalog.version_id != request.game_data_version_id:
        raise StructuredError(
            code=ErrorCode.BREEDING_GAME_DATA_VERSION_MISMATCH,
            summary="The loaded breeding catalog does not match the fixed job version.",
            retryable=False,
        )
    if facts.catalog.status != "published":
        raise StructuredError(
            code=ErrorCode.BREEDING_GAME_DATA_NOT_PUBLISHED,
            summary="Breeding may only use an exact published catalog version.",
            retryable=False,
        )
    if facts.catalog.content_hash != request.game_data_content_hash:
        raise StructuredError(
            code=ErrorCode.BREEDING_GAME_DATA_CONTENT_MISMATCH,
            summary="The loaded breeding catalog content hash does not match the request.",
            retryable=False,
        )
    if facts.inventory.snapshot_id != request.inventory_snapshot_id:
        raise StructuredError(
            code=ErrorCode.BREEDING_INVENTORY_SNAPSHOT_MISMATCH,
            summary="The loaded inventory does not match the fixed snapshot.",
            retryable=False,
        )
    if facts.inventory.world_id != request.world_id:
        raise StructuredError(
            code=ErrorCode.BREEDING_INVENTORY_WORLD_MISMATCH,
            summary="The loaded inventory snapshot belongs to a different world.",
            retryable=False,
        )
    request_items = tuple(sorted(request.inventory, key=lambda item: item.instance_uid))
    fact_items = tuple(sorted(facts.inventory.items, key=lambda item: item.instance_uid))
    if request_items != fact_items:
        raise StructuredError(
            code=ErrorCode.BREEDING_INVENTORY_CONTENT_MISMATCH,
            summary="The loaded inventory facts do not match the engine request.",
            retryable=False,
        )
    referenced_pal_ids = {
        request.target_pal_id,
        *(item.pal_id for item in fact_items),
        *(
            pal_id
            for recipe in facts.catalog.recipes
            for pal_id in (
                recipe.parent_a_pal_id,
                recipe.parent_b_pal_id,
                recipe.child_pal_id,
            )
        ),
    }
    if not referenced_pal_ids.issubset(facts.catalog.pal_ids) or not set(
        request.desired_passive_ids
    ).issubset(facts.catalog.passive_skill_ids):
        raise StructuredError(
            code=ErrorCode.BREEDING_CATALOG_MEMBER_MISSING,
            summary="The fixed request references facts outside the exact catalog version.",
            retryable=False,
        )


def _route_key(request: BreedingEngineRequest, plan_signature: str) -> str:
    canonical = "\0".join(
        (
            request.algorithm_version,
            request.scoring_profile_version,
            str(request.inventory_snapshot_id),
            str(request.game_data_version_id),
            request.game_data_content_hash,
            request.target_pal_id,
            ",".join(sorted(request.desired_passive_ids)),
            plan_signature,
        )
    )
    return hashlib.sha256(canonical.encode()).hexdigest()


def _candidate_rank(
    candidate: BreedingRouteCandidate,
    mode: OptimizationMode,
) -> tuple[int, int, float, int, int, int, str]:
    score = mode_score(candidate.score_breakdown, mode)
    return (
        0 if candidate.feasibility_status is BreedingFeasibilityStatus.READY else 1,
        candidate.missing_pal_count,
        -score,
        candidate.generation_count,
        candidate.step_count,
        candidate.borrowed_pal_count,
        candidate.route_key,
    )


def _mode_rankings(candidates: list[BreedingRouteCandidate]) -> list[BreedingModeRanking]:
    rankings: list[BreedingModeRanking] = []
    for mode in OptimizationMode:
        rankings.append(
            BreedingModeRanking(
                optimization_mode=mode,
                scoring_profile_version=PROFILE_VERSIONS[mode],
                route_keys=[
                    candidate.route_key
                    for candidate in sorted(
                        candidates,
                        key=lambda item: _candidate_rank(item, mode),
                    )
                ],
            )
        )
    return rankings


def _explanation_codes(
    *,
    returned_count: int,
    returned_all: bool,
    hit_limits: tuple[BreedingSearchLimit, ...],
    soft_pruned: bool,
    missing_passive_ids: tuple[str, ...],
) -> list[str]:
    codes: list[str] = []
    if missing_passive_ids:
        codes.append("MISSING_PASSIVE_SOURCES")
    if BreedingSearchLimit.TIMEOUT in hit_limits:
        codes.append("SEARCH_TIMEOUT")
    if any(limit != BreedingSearchLimit.TIMEOUT for limit in hit_limits):
        codes.append("SEARCH_LIMIT_REACHED")
    if soft_pruned:
        codes.append("SEARCH_PRUNED")
    if returned_all:
        if returned_count == 0:
            codes.append("NO_LEGAL_ROUTE")
        elif returned_count < 3:
            codes.append("FEWER_THAN_THREE_LEGAL_ROUTES")
    elif returned_count < 3:
        codes.append("SEARCH_INCOMPLETE")
    return codes


def _validate_serialized_relations(
    index: BreedingRecipeIndex,
    steps: tuple[BreedingRouteStep, ...],
) -> None:
    for step in steps:
        # Kept behind the generated DTO boundary so no unvalidated relation can escape.
        if step.parent_a.gender is None or step.parent_b.gender is None:
            raise RuntimeError("serialized breeding route contains a parent without gender")
        parent_a_gender = step.parent_a.gender.value
        parent_b_gender = step.parent_b.gender.value
        if parent_a_gender not in ("female", "male") or parent_b_gender not in (
            "female",
            "male",
        ):
            raise RuntimeError("serialized breeding route contains a non-breeding gender")
        effective = index.resolve(
            step.parent_a.pal_id,
            step.parent_b.pal_id,
            cast(ConcreteGender, parent_a_gender),
            cast(ConcreteGender, parent_b_gender),
        )
        if (
            effective is None
            or effective.child_pal_id != step.child_pal_id
            or effective.recipe_type != step.recipe_type
        ):
            raise RuntimeError("serialized breeding route escaped the effective recipe index")


def _result_digest(result: BreedingEngineResult) -> str:
    payload = result.model_dump(mode="json")
    payload.pop("result_digest", None)
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode()).hexdigest()
