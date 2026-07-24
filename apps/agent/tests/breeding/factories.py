from collections.abc import Iterable
from typing import Literal
from uuid import UUID

from pal_hatch_helper.breeding.engine import (
    ALGORITHM_VERSION,
    DeterministicBreedingEngine,
    scoring_profile_version_for,
)
from pal_hatch_helper.breeding.facts import (
    BreedingRuntimeFacts,
    FixedInventorySnapshot,
    VersionedBreedingCatalog,
)
from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingEngineRequest,
    BreedingEngineResult,
    BreedingSearchLimits,
    CatalogBreedingRecipe,
    OptimizationMode,
)

SNAPSHOT_ID = UUID("10000000-0000-4000-8000-000000000001")
WORLD_ID = UUID("10000000-0000-4000-8000-000000000099")
GAME_DATA_VERSION_ID = UUID("20000000-0000-4000-8000-000000000001")
GAME_DATA_CONTENT_HASH = "a" * 64
REQUESTER_ID = UUID("30000000-0000-4000-8000-000000000001")
GUILD_ID = UUID("40000000-0000-4000-8000-000000000001")
OTHER_PLAYER_ID = UUID("30000000-0000-4000-8000-000000000002")
OTHER_GUILD_ID = UUID("40000000-0000-4000-8000-000000000002")


def recipe(
    parent_a: str,
    parent_b: str,
    child: str,
    *,
    recipe_type: str = "normal",
    parent_a_gender: str = "any",
    parent_b_gender: str = "any",
) -> CatalogBreedingRecipe:
    return CatalogBreedingRecipe(
        parent_a_pal_id=parent_a,
        parent_a_gender=parent_a_gender,
        parent_b_pal_id=parent_b,
        parent_b_gender=parent_b_gender,
        child_pal_id=child,
        recipe_type=recipe_type,
        metadata={"fixture": True},
    )


def inventory_pal(
    uid: str,
    pal_id: str,
    gender: str,
    *,
    passives: Iterable[str] = (),
    owner_player_id: UUID | None = REQUESTER_ID,
    guild_id: UUID | None = GUILD_ID,
    ownership_scope: Literal["player", "guild", "unresolved"] = "player",
    share_enabled: bool = True,
    owner_resolved: bool = True,
    guild_resolved: bool = True,
    present_in_snapshot: bool = True,
    breeding_enabled: bool = True,
    plan_locked: bool = False,
) -> BreedingEngineInventoryPal:
    return BreedingEngineInventoryPal(
        instance_uid=uid,
        pal_id=pal_id,
        owner_player_id=owner_player_id,
        guild_id=guild_id,
        gender=gender,
        passive_skill_ids=sorted(passives),
        location_type="base",
        location_name="Fixture Base",
        ownership_scope=ownership_scope,
        share_enabled=share_enabled,
        owner_resolved=owner_resolved,
        guild_resolved=guild_resolved,
        present_in_snapshot=present_in_snapshot,
        breeding_enabled=breeding_enabled,
        plan_locked=plan_locked,
    )


def limits(
    *,
    max_generations: int = 5,
    max_expanded_nodes: int = 50_000,
    timeout_ms: int = 10_000,
    max_species_routes_per_pal: int = 256,
    max_assignment_states_per_mask: int = 32,
    max_candidate_routes: int = 256,
    max_results: int = 24,
) -> BreedingSearchLimits:
    return BreedingSearchLimits(
        max_generations=max_generations,
        max_expanded_nodes=max_expanded_nodes,
        timeout_ms=timeout_ms,
        max_species_routes_per_pal=max_species_routes_per_pal,
        max_assignment_states_per_mask=max_assignment_states_per_mask,
        max_candidate_routes=max_candidate_routes,
        max_results=max_results,
    )


def request(
    target_pal_id: str,
    inventory: Iterable[BreedingEngineInventoryPal],
    *,
    desired_passive_ids: Iterable[str] = (),
    optimization_mode: OptimizationMode = OptimizationMode.BALANCED,
    search_limits: BreedingSearchLimits | None = None,
    allow_shared_inventory: bool = True,
    allow_locked_reuse: bool = False,
    algorithm_version: str = ALGORITHM_VERSION,
    scoring_profile_version: str | None = None,
) -> BreedingEngineRequest:
    return BreedingEngineRequest(
        target_pal_id=target_pal_id,
        desired_passive_ids=sorted(desired_passive_ids),
        world_id=WORLD_ID,
        inventory_snapshot_id=SNAPSHOT_ID,
        game_data_version_id=GAME_DATA_VERSION_ID,
        game_data_content_hash=GAME_DATA_CONTENT_HASH,
        algorithm_version=algorithm_version,
        scoring_profile_version=(
            scoring_profile_version
            if scoring_profile_version is not None
            else scoring_profile_version_for(optimization_mode)
        ),
        optimization_mode=optimization_mode,
        requester_player_id=REQUESTER_ID,
        requester_guild_id=GUILD_ID,
        allow_shared_inventory=allow_shared_inventory,
        allow_locked_reuse=allow_locked_reuse,
        inventory=sorted(inventory, key=lambda item: item.instance_uid),
        limits=search_limits or limits(),
    )


def runtime_facts(
    request_value: BreedingEngineRequest,
    recipes: Iterable[CatalogBreedingRecipe],
) -> BreedingRuntimeFacts:
    recipe_values = tuple(recipes)
    pal_ids = {request_value.target_pal_id, *(item.pal_id for item in request_value.inventory)}
    for value in recipe_values:
        pal_ids.update((value.parent_a_pal_id, value.parent_b_pal_id, value.child_pal_id))
    passive_ids = {
        *request_value.desired_passive_ids,
        *(passive_id for item in request_value.inventory for passive_id in item.passive_skill_ids),
    }
    return BreedingRuntimeFacts(
        catalog=VersionedBreedingCatalog(
            version_id=request_value.game_data_version_id,
            content_hash=request_value.game_data_content_hash,
            status="published",
            pal_ids=frozenset(pal_ids),
            passive_skill_ids=frozenset(passive_ids),
            recipes=recipe_values,
        ),
        inventory=FixedInventorySnapshot(
            snapshot_id=request_value.inventory_snapshot_id,
            world_id=request_value.world_id,
            items=tuple(request_value.inventory),
        ),
    )


def search(
    engine: DeterministicBreedingEngine,
    request_value: BreedingEngineRequest,
    recipes: Iterable[CatalogBreedingRecipe],
) -> BreedingEngineResult:
    return engine.search(request_value, runtime_facts(request_value, recipes))
