from datetime import UTC, datetime

import pytest

from pal_hatch_helper.plans.candidates import (
    CandidateDetectionStep,
    LocationType,
    PalGender,
    SnapshotDeltaReader,
    SnapshotPal,
    rank_offspring_candidates,
)


def _pal(
    uid: str,
    species: str,
    *,
    passives: tuple[str, ...] = (),
    location: LocationType = "player_storage",
    gender: PalGender = "female",
    owner: str = "Fixture Player",
    accessible: bool = True,
) -> SnapshotPal:
    return SnapshotPal(
        instance_uid=uid,
        pal_id=species,
        gender=gender,
        passive_skill_ids=passives,
        level=10,
        owner_display_name=owner,
        location_type=location,
        location_name="Fixture Storage",
        accessible=accessible,
    )


def test_snapshot_delta_only_returns_first_appearance_after_baseline() -> None:
    baseline = (
        _pal("parent-a", "parent_a"),
        _pal("moved", "child"),
    )
    current = (
        _pal("parent-a", "parent_a"),
        _pal("moved", "child", location="base"),
        _pal("new-child", "child", passives=("wanted",)),
        _pal("returned", "child"),
    )

    delta = SnapshotDeltaReader().new_instances(
        baseline=baseline,
        current=current,
        seen_before_or_at_baseline=frozenset({"parent-a", "moved", "returned"}),
    )

    assert tuple(item.instance_uid for item in delta) == ("new-child",)


def test_location_and_owner_changes_never_create_a_new_instance() -> None:
    baseline = (_pal("stable", "child", owner="Owner A"),)
    current = (_pal("stable", "child", owner="Owner B", location="base"),)

    delta = SnapshotDeltaReader().new_instances(
        baseline=baseline,
        current=current,
        seen_before_or_at_baseline=frozenset({"stable"}),
    )

    assert delta == ()


def test_duplicate_uid_in_a_normalized_snapshot_is_rejected() -> None:
    with pytest.raises(ValueError, match="duplicate instance UID"):
        SnapshotDeltaReader().new_instances(
            baseline=(),
            current=(_pal("duplicate", "child"), _pal("duplicate", "child")),
            seen_before_or_at_baseline=frozenset(),
        )


def test_candidate_matching_excludes_wrong_species_and_sorts_all_matches() -> None:
    step = CandidateDetectionStep(
        step_id="step-1",
        expected_child_pal_id="child",
        required_passive_ids=("wanted", "speed"),
        preferred_gender="female",
        detected_snapshot_id="snapshot-2",
        detected_at=datetime(2026, 7, 16, tzinfo=UTC),
    )
    candidates = rank_offspring_candidates(
        step,
        (
            _pal("wrong", "other", passives=("wanted", "speed")),
            _pal("partial", "child", passives=("wanted",)),
            _pal("perfect", "child", passives=("wanted", "speed")),
        ),
    )

    assert [candidate.pal_instance_uid for candidate in candidates] == [
        "perfect",
        "partial",
    ]
    assert candidates[0].match_score > candidates[1].match_score
    assert candidates[0].matched_passive_ids == ("speed", "wanted")
    assert candidates[0].match_breakdown["passive_overlap"] == 1


def test_gender_feasibility_and_accessibility_are_deterministic() -> None:
    step = CandidateDetectionStep(
        step_id="step-1",
        expected_child_pal_id="child",
        required_passive_ids=(),
        preferred_gender="female",
        detected_snapshot_id="snapshot-2",
        detected_at=datetime(2026, 7, 16, tzinfo=UTC),
    )

    candidates = rank_offspring_candidates(
        step,
        (
            _pal("male", "child", gender="male"),
            _pal("female", "child", gender="female"),
            _pal("private", "child", accessible=False),
        ),
    )

    assert [candidate.pal_instance_uid for candidate in candidates] == ["female", "male"]
    assert candidates[0].match_breakdown["gender"] == 1
    assert candidates[1].match_breakdown["gender"] == 0
    assert (
        candidates[0].candidate_key
        == rank_offspring_candidates(step, (_pal("female", "child"),))[0].candidate_key
    )
