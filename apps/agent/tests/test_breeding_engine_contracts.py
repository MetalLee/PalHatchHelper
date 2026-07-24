from uuid import UUID

import pytest
from pydantic import ValidationError

from pal_hatch_helper.generated import (
    BreedingEngineInventoryPal,
    BreedingEngineRequest,
    BreedingPassiveSource,
    BreedingSearchLimits,
)


def valid_request_data() -> dict[str, object]:
    return {
        "target_pal_id": "pal-target",
        "desired_passive_ids": ["passive-a", "passive-b"],
        "world_id": UUID("10000000-0000-4000-8000-000000000099"),
        "inventory_snapshot_id": UUID("10000000-0000-4000-8000-000000000001"),
        "game_data_version_id": UUID("20000000-0000-4000-8000-000000000001"),
        "game_data_content_hash": "a" * 64,
        "algorithm_version": "phase4b-deterministic-v1",
        "scoring_profile_version": "balanced-v2",
        "optimization_mode": "balanced",
        "requester_player_id": UUID("30000000-0000-4000-8000-000000000001"),
        "requester_guild_id": UUID("40000000-0000-4000-8000-000000000001"),
        "allow_shared_inventory": True,
        "allow_locked_reuse": False,
        "inventory": [
            {
                "instance_uid": "fixture-a",
                "pal_id": "pal-a",
                "owner_player_id": UUID("30000000-0000-4000-8000-000000000001"),
                "guild_id": UUID("40000000-0000-4000-8000-000000000001"),
                "gender": "male",
                "passive_skill_ids": ["passive-a"],
                "location_type": "base",
                "location_name": "Fixture Base",
                "ownership_scope": "player",
                "share_enabled": False,
                "owner_resolved": True,
                "guild_resolved": True,
                "present_in_snapshot": True,
                "breeding_enabled": True,
                "plan_locked": False,
            }
        ],
        "limits": {
            "max_generations": 5,
            "max_expanded_nodes": 50_000,
            "timeout_ms": 10_000,
            "max_species_routes_per_pal": 256,
            "max_assignment_states_per_mask": 32,
            "max_candidate_routes": 256,
            "max_results": 24,
        },
    }


def test_generated_engine_request_accepts_the_fixed_versioned_boundary() -> None:
    value = BreedingEngineRequest.model_validate(valid_request_data())

    assert isinstance(value.inventory[0], BreedingEngineInventoryPal)
    assert isinstance(value.limits, BreedingSearchLimits)
    assert value.desired_passive_ids == ["passive-a", "passive-b"]


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("desired_passive_ids", ["a", "b", "c", "d", "e"]),
        ("desired_passive_ids", ["same", "same"]),
        ("optimization_mode", "ai_decides"),
    ],
)
def test_generated_engine_request_rejects_invalid_boundaries(
    field: str,
    invalid_value: object,
) -> None:
    data = valid_request_data()
    data[field] = invalid_value

    with pytest.raises(ValidationError):
        BreedingEngineRequest.model_validate(data)


def test_engine_contract_has_no_ai_score_or_legality_override() -> None:
    data = valid_request_data()
    data["ai_score_override"] = 100

    with pytest.raises(ValidationError):
        BreedingEngineRequest.model_validate(data)


def test_passive_source_requires_a_real_inventory_instance_uid() -> None:
    with pytest.raises(ValidationError):
        BreedingPassiveSource.model_validate(
            {
                "passive_id": "passive-a",
                "source_instance_uid": "",
                "source_pal_id": "pal-a",
                "first_required_step_index": 0,
            }
        )
