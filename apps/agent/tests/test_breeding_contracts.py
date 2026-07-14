from datetime import UTC, datetime
from uuid import UUID

import pytest
from pydantic import ValidationError

from pal_hatch_helper.generated.contracts import (
    BreedingJob,
    OptimizationMode,
    PalGender,
    PalListItem,
    PalLocationType,
)


def valid_job_data() -> dict[str, object]:
    return {
        "job_id": UUID("11111111-1111-4111-8111-111111111111"),
        "requester_user_id": UUID("22222222-2222-4222-8222-222222222222"),
        "world_id": UUID("77777777-7777-4777-8777-777777777777"),
        "player_id": UUID("33333333-3333-4333-8333-333333333333"),
        "guild_id": UUID("44444444-4444-4444-8444-444444444444"),
        "target_pal_id": "test_target_pal",
        "desired_passive_ids": ["test_passive_a", "test_passive_b"],
        "optimization_mode": OptimizationMode.BALANCED,
        "inventory_snapshot_id": UUID("55555555-5555-4555-8555-555555555555"),
        "game_data_version_id": UUID("66666666-6666-4666-8666-666666666666"),
        "breeding_data_version_id": UUID("66666666-6666-4666-8666-666666666666"),
        "algorithm_version": "phase1-contract-v1",
        "scoring_profile_version": "balanced-v1",
        "status": "pending",
        "attempt_count": 0,
        "error_code": None,
        "created_at": datetime(2026, 7, 13, tzinfo=UTC),
        "completed_at": None,
    }


def test_generated_breeding_job_accepts_valid_data() -> None:
    job = BreedingJob.model_validate(valid_job_data())

    assert job.optimization_mode is OptimizationMode.BALANCED
    assert job.desired_passive_ids == ["test_passive_a", "test_passive_b"]


@pytest.mark.parametrize(
    ("field", "invalid_value"),
    [
        ("desired_passive_ids", ["a", "b", "c", "d", "e"]),
        ("optimization_mode", "fewest_eggs"),
    ],
)
def test_generated_breeding_job_rejects_invalid_boundaries(
    field: str,
    invalid_value: object,
) -> None:
    data = valid_job_data()
    data[field] = invalid_value

    with pytest.raises(ValidationError):
        BreedingJob.model_validate(data)


def test_generated_breeding_job_rejects_naive_datetimes() -> None:
    data = valid_job_data()
    data["created_at"] = datetime(2026, 7, 13)

    with pytest.raises(ValidationError):
        BreedingJob.model_validate(data)


@pytest.mark.parametrize("target_pal_id", ["Pal Target", "UPPERCASE", "x" * 121])
def test_breeding_job_reuses_the_shared_stable_id_constraint(target_pal_id: str) -> None:
    data = valid_job_data()
    data["target_pal_id"] = target_pal_id

    with pytest.raises(ValidationError):
        BreedingJob.model_validate(data)


def test_generated_pal_list_item_accepts_safe_projection() -> None:
    item = PalListItem.model_validate(
        {
            "snapshot_id": UUID("55555555-5555-4555-8555-555555555555"),
            "pal_instance_uid": "fixture-pal-shared-001",
            "pal_id": "test_shared_pal",
            "owner_player_id": UUID("33333333-3333-4333-8333-333333333333"),
            "owner_display_name": "Fixture Player",
            "guild_id": UUID("44444444-4444-4444-8444-444444444444"),
            "gender": PalGender.FEMALE,
            "level": 20,
            "passive_skill_ids": ["test_passive_a"],
            "location_type": PalLocationType.BASE,
            "location_name": "Fixture Base",
            "share_enabled": True,
            "is_owned_by_requester": False,
        }
    )

    assert item.gender is PalGender.FEMALE


def test_generated_pal_list_item_rejects_raw_metadata() -> None:
    with pytest.raises(ValidationError):
        PalListItem.model_validate(
            {
                "snapshot_id": UUID("55555555-5555-4555-8555-555555555555"),
                "pal_instance_uid": "fixture-pal-shared-001",
                "pal_id": "test_shared_pal",
                "owner_player_id": UUID("33333333-3333-4333-8333-333333333333"),
                "owner_display_name": "Fixture Player",
                "guild_id": UUID("44444444-4444-4444-8444-444444444444"),
                "gender": PalGender.FEMALE,
                "level": 20,
                "passive_skill_ids": ["test_passive_a"],
                "location_type": PalLocationType.BASE,
                "location_name": "Fixture Base",
                "share_enabled": True,
                "is_owned_by_requester": False,
                "raw_metadata": {"source_path": "/forbidden"},
            }
        )
