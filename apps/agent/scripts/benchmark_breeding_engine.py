#!/usr/bin/env python3
import json
import random
import time
import tracemalloc
from dataclasses import dataclass
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
    BreedingSearchLimits,
    CatalogBreedingRecipe,
    OptimizationMode,
)

SEED = 20260714
SNAPSHOT_ID = UUID("10000000-0000-4000-8000-000000000001")
WORLD_ID = UUID("10000000-0000-4000-8000-000000000099")
GAME_DATA_VERSION_ID = UUID("20000000-0000-4000-8000-000000000001")
GAME_DATA_CONTENT_HASH = "a" * 64
PLAYER_ID = UUID("30000000-0000-4000-8000-000000000001")
GUILD_ID = UUID("40000000-0000-4000-8000-000000000001")


@dataclass(frozen=True, slots=True)
class SyntheticCase:
    request: BreedingEngineRequest
    facts: BreedingRuntimeFacts


def build_synthetic_case() -> SyntheticCase:
    randomizer = random.Random(SEED)
    base = [f"bench-base-{index:03d}" for index in range(48)]
    level_one = [f"bench-l1-{index:03d}" for index in range(36)]
    level_two = [f"bench-l2-{index:03d}" for index in range(24)]
    level_three = [f"bench-l3-{index:03d}" for index in range(12)]
    used_pairs: set[tuple[str, str]] = set()
    recipes: list[CatalogBreedingRecipe] = []

    def add_layer(children: list[str], parents: list[str], variants: int) -> None:
        for child in children:
            created = 0
            while created < variants:
                parent_a, parent_b = sorted(randomizer.sample(parents, 2))
                pair = (parent_a, parent_b)
                if pair in used_pairs:
                    continue
                used_pairs.add(pair)
                recipes.append(
                    CatalogBreedingRecipe(
                        parent_a_pal_id=parent_a,
                        parent_b_pal_id=parent_b,
                        child_pal_id=child,
                        recipe_type=("special" if len(recipes) % 29 == 0 else "normal"),
                        metadata={"fixture": "synthetic-benchmark"},
                    )
                )
                created += 1

    add_layer(level_one, base, 3)
    add_layer(level_two, level_one + base, 3)
    add_layer(level_three, level_two + level_one, 3)
    add_layer(["bench-target"], level_three + level_two, 12)

    desired = [f"bench-passive-{index}" for index in range(4)]
    inventory: list[BreedingEngineInventoryPal] = []
    for index, pal_id in enumerate(base):
        passive_ids = [desired[index % len(desired)]]
        if index % 7 == 0:
            passive_ids.append(f"bench-extra-{index % 3}")
        for gender in ("male", "female"):
            inventory.append(
                BreedingEngineInventoryPal(
                    instance_uid=f"{pal_id}-{gender}",
                    pal_id=pal_id,
                    owner_player_id=PLAYER_ID,
                    guild_id=GUILD_ID,
                    gender=gender,
                    passive_skill_ids=passive_ids,
                    location_type="base",
                    location_name="Synthetic Benchmark Base",
                    share_enabled=True,
                    owner_resolved=True,
                    guild_resolved=True,
                    present_in_snapshot=True,
                    breeding_enabled=True,
                    plan_locked=False,
                )
            )
    mode = OptimizationMode.BALANCED
    request = BreedingEngineRequest(
        target_pal_id="bench-target",
        desired_passive_ids=desired,
        world_id=WORLD_ID,
        inventory_snapshot_id=SNAPSHOT_ID,
        game_data_version_id=GAME_DATA_VERSION_ID,
        game_data_content_hash=GAME_DATA_CONTENT_HASH,
        algorithm_version=ALGORITHM_VERSION,
        scoring_profile_version=scoring_profile_version_for(mode),
        optimization_mode=mode,
        requester_player_id=PLAYER_ID,
        requester_guild_id=GUILD_ID,
        allow_shared_inventory=True,
        allow_locked_reuse=False,
        inventory=inventory,
        limits=BreedingSearchLimits(
            max_generations=4,
            max_expanded_nodes=200_000,
            timeout_ms=5_000,
            max_species_routes_per_pal=128,
            max_assignment_states_per_mask=16,
            max_candidate_routes=256,
            max_results=12,
        ),
    )
    pal_ids = {
        request.target_pal_id,
        *(item.pal_id for item in inventory),
        *(
            pal_id
            for recipe in recipes
            for pal_id in (
                recipe.parent_a_pal_id,
                recipe.parent_b_pal_id,
                recipe.child_pal_id,
            )
        ),
    }
    return SyntheticCase(
        request=request,
        facts=BreedingRuntimeFacts(
            catalog=VersionedBreedingCatalog(
                version_id=GAME_DATA_VERSION_ID,
                content_hash=GAME_DATA_CONTENT_HASH,
                status="published",
                pal_ids=frozenset(pal_ids),
                passive_skill_ids=frozenset(desired),
                recipes=tuple(recipes),
            ),
            inventory=FixedInventorySnapshot(
                snapshot_id=SNAPSHOT_ID,
                world_id=WORLD_ID,
                items=tuple(inventory),
            ),
        ),
    )


def main() -> None:
    case = build_synthetic_case()
    tracemalloc.start()
    started_at = time.perf_counter()
    result = DeterministicBreedingEngine().search(case.request, case.facts)
    elapsed_ms = (time.perf_counter() - started_at) * 1000
    _, peak_memory_bytes = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    diagnostics = result.diagnostics
    report = {
        "seed": SEED,
        "graph": {
            "pal_species": diagnostics.graph_pal_count,
            "effective_recipes": diagnostics.effective_recipe_count,
            "inventory_instances": diagnostics.inventory_input_count,
        },
        "expanded_nodes": {
            "species": diagnostics.expanded_species_nodes,
            "assignment": diagnostics.expanded_assignment_nodes,
            "total": diagnostics.expanded_nodes,
        },
        "elapsed_ms": round(elapsed_ms, 3),
        "peak_memory_bytes": peak_memory_bytes,
        "pruned": {
            "species_routes": diagnostics.pruned_species_routes,
            "assignment_states": diagnostics.pruned_assignment_states,
            "duplicate_routes": diagnostics.pruned_duplicate_routes,
        },
        "candidate_routes_evaluated": diagnostics.candidate_routes_evaluated,
        "returned_routes": len(result.routes),
        "hit_limits": [limit.value for limit in diagnostics.hit_limits],
        "search_complete": diagnostics.search_complete,
        "result_digest": result.result_digest,
    }
    print(json.dumps(report, ensure_ascii=False, sort_keys=True, separators=(",", ":")))


if __name__ == "__main__":
    main()
