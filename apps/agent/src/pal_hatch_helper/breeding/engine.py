import hashlib
import json
import time
from collections import defaultdict
from collections.abc import Callable
from typing import Final, cast

from pal_hatch_helper.breeding.assignment import assign_species_route
from pal_hatch_helper.breeding.facts import BreedingRuntimeFacts
from pal_hatch_helper.breeding.index import BreedingRecipeIndex, ConcreteGender
from pal_hatch_helper.breeding.inventory import select_eligible_inventory
from pal_hatch_helper.breeding.limits import SearchBudget, SearchStopped
from pal_hatch_helper.breeding.planning import (
    physical_plan_signature,
    plan_passive_retention,
    serialize_plan,
)
from pal_hatch_helper.breeding.scoring import (
    PROFILE_VERSIONS,
    mode_score,
    score_plan,
)
from pal_hatch_helper.breeding.search import (
    SpeciesRoute,
    direct_target_routes,
    search_species_routes,
)
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

ALGORITHM_VERSION: Final = "inventory-aware-deterministic-v2"


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
        species_node_budget = max(1, request.limits.max_expanded_nodes // 2)
        assignment_node_budget = max(1, request.limits.max_expanded_nodes - species_node_budget)
        species_time_budget = max(1, request.limits.timeout_ms // 2)
        assignment_time_budget = max(1, request.limits.timeout_ms - species_time_budget)
        species_budget = SearchBudget(
            max_expanded_nodes=species_node_budget,
            timeout_ms=species_time_budget,
            clock=self._clock,
        )
        species_result = search_species_routes(
            index,
            starting_species=frozenset(inventory_by_species),
            target_pal_id=request.target_pal_id,
            max_generations=request.limits.max_generations,
            max_routes_per_pal=request.limits.max_species_routes_per_pal,
            budget=species_budget,
        )
        fallback_result = direct_target_routes(
            index,
            inventory_species=frozenset(inventory_by_species),
            target_pal_id=request.target_pal_id,
            max_routes=request.limits.max_species_routes_per_pal,
        )
        species_routes_by_key: dict[str, SpeciesRoute] = {}
        fallback_head = fallback_result.routes[:1]
        fallback_seed_signature = fallback_head[0].signature if fallback_head else None
        for route in (
            *fallback_head,
            *species_result.routes,
            *fallback_result.routes[1:],
        ):
            species_routes_by_key.setdefault(route.signature, route)
        species_routes = tuple(species_routes_by_key.values())
        assignment_budget = SearchBudget(
            max_expanded_nodes=assignment_node_budget,
            timeout_ms=assignment_time_budget,
            clock=self._clock,
        )
        pruned_assignment_states = 0
        candidates_by_key: dict[str, BreedingRouteCandidate] = {}
        physical_plan_keys: set[str] = set()
        pruned_physical_duplicates = 0
        stopped_by = species_result.stopped_by

        for species_route in species_routes:
            try:
                assignment_result = assign_species_route(
                    species_route,
                    inventory_by_species=inventory_by_species,
                    desired_passive_ids=desired_passive_ids,
                    requester_player_id=request.requester_player_id,
                    max_states_per_mask=request.limits.max_assignment_states_per_mask,
                    budget=assignment_budget,
                )
            except SearchStopped as stopped:
                stopped_by = stopped.limit
                break
            pruned_assignment_states += assignment_result.pruned_states
            for assignment in assignment_result.assignments:
                planned = plan_passive_retention(assignment, desired_passive_ids)
                serialized = serialize_plan(
                    planned,
                    desired_passive_ids=desired_passive_ids,
                    requester_player_id=request.requester_player_id,
                )
                physical_key = physical_plan_signature(serialized)
                if physical_key in physical_plan_keys:
                    pruned_physical_duplicates += 1
                    continue
                if len(candidates_by_key) >= request.limits.max_candidate_routes:
                    break
                _validate_serialized_relations(index, serialized.steps)
                scored = score_plan(
                    planned,
                    serialized,
                    desired_passive_ids=desired_passive_ids,
                    requested_scoring_profile_version=request.scoring_profile_version,
                )
                route_key = _route_key(request, physical_key)
                physical_plan_keys.add(physical_key)
                candidates_by_key[route_key] = BreedingRouteCandidate(
                    route_key=route_key,
                    rank=1,
                    optimization_mode=request.optimization_mode,
                    total_score=mode_score(
                        scored.breakdown,
                        request.optimization_mode,
                    ),
                    generation_count=scored.metrics.generation_count,
                    step_count=scored.metrics.step_count,
                    estimated_attempts_min=scored.metrics.estimated_attempts_min,
                    estimated_attempts_max=scored.metrics.estimated_attempts_max,
                    difficulty=scored.metrics.difficulty,
                    borrowed_pal_count=scored.metrics.borrowed_pal_count,
                    inventory_coverage=scored.metrics.inventory_coverage,
                    inheritance_score=scored.inheritance_score,
                    feasibility_status=(
                        BreedingFeasibilityStatus.READY
                        if not serialized.missing_requirements
                        else BreedingFeasibilityStatus.NEEDS_INVENTORY
                    ),
                    adoptable=not serialized.missing_requirements,
                    missing_pal_count=sum(
                        item.quantity for item in serialized.missing_requirements
                    ),
                    missing_requirements=list(serialized.missing_requirements),
                    existing_target_instance_uid=(serialized.existing_target_instance_uid),
                    score_breakdown=scored.breakdown,
                    steps=list(serialized.steps),
                )
                if (
                    species_route.signature == fallback_seed_signature
                    and serialized.missing_requirements
                ):
                    break
            if len(candidates_by_key) >= request.limits.max_candidate_routes:
                break

        all_candidates = tuple(candidates_by_key.values())
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
        hit_limits = tuple(
            sorted(
                {*species_budget.hit_limits, *assignment_budget.hit_limits},
                key=lambda item: item.value,
            )
        )
        search_complete = not hit_limits and stopped_by is None
        soft_pruned = bool(
            species_result.pruned_routes
            or fallback_result.pruned_routes
            or pruned_assignment_states
            or len(all_candidates) >= request.limits.max_candidate_routes
        )
        returned_all = (
            search_complete
            and not soft_pruned
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
            expanded_species_nodes=species_budget.expanded_species_nodes,
            expanded_assignment_nodes=assignment_budget.expanded_assignment_nodes,
            expanded_nodes=(species_budget.expanded_nodes + assignment_budget.expanded_nodes),
            pruned_species_routes=(species_result.pruned_routes + fallback_result.pruned_routes),
            pruned_assignment_states=pruned_assignment_states,
            pruned_duplicate_routes=(
                species_result.duplicate_routes
                + fallback_result.duplicate_routes
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
            routes=returned,
            mode_rankings=_mode_rankings(returned),
            explanation_codes=_explanation_codes(
                returned_count=len(returned),
                returned_all=returned_all,
                hit_limits=hit_limits,
                soft_pruned=soft_pruned,
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
) -> tuple[int, float, int, int, int, str]:
    score = mode_score(candidate.score_breakdown, mode)
    return (
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
) -> list[str]:
    codes: list[str] = []
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
