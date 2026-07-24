import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

type PalGender = Literal["male", "female", "genderless", "unknown"]
type PreferredGender = Literal["male", "female"]
type LocationType = Literal[
    "player_party",
    "player_storage",
    "base",
    "dimensional_storage",
    "viewing_cage",
    "unknown",
]


@dataclass(frozen=True, slots=True)
class SnapshotPal:
    instance_uid: str
    pal_id: str
    gender: PalGender
    passive_skill_ids: tuple[str, ...]
    level: int | None
    owner_display_name: str
    location_type: LocationType
    location_name: str | None
    accessible: bool


@dataclass(frozen=True, slots=True)
class CandidateDetectionStep:
    step_id: str
    expected_child_pal_id: str
    required_passive_ids: tuple[str, ...]
    preferred_gender: PreferredGender | None
    detected_snapshot_id: str
    detected_at: datetime


@dataclass(frozen=True, slots=True)
class CandidateMatch:
    candidate_key: str
    pal_instance_uid: str
    match_score: float
    matched_passive_ids: tuple[str, ...]
    match_breakdown: dict[str, float]


class SnapshotDeltaReader:
    """Compare immutable normalized snapshots by world-scoped instance UID.

    `seen_before_or_at_baseline` is intentionally supplied by the repository across
    all earlier published snapshots, so a disappeared-and-returned UID is not
    mistaken for a new offspring.
    """

    def new_instances(
        self,
        *,
        baseline: tuple[SnapshotPal, ...],
        current: tuple[SnapshotPal, ...],
        seen_before_or_at_baseline: frozenset[str],
    ) -> tuple[SnapshotPal, ...]:
        baseline_uids = {item.instance_uid for item in baseline}
        seen = baseline_uids | set(seen_before_or_at_baseline)
        unique: dict[str, SnapshotPal] = {}
        for item in current:
            if item.instance_uid in unique:
                raise ValueError("duplicate instance UID in normalized snapshot")
            unique[item.instance_uid] = item
        return tuple(unique[uid] for uid in sorted(unique) if uid not in seen)


def rank_offspring_candidates(
    step: CandidateDetectionStep,
    new_instances: tuple[SnapshotPal, ...],
) -> tuple[CandidateMatch, ...]:
    required = frozenset(step.required_passive_ids)
    matches: list[CandidateMatch] = []
    for item in new_instances:
        if item.pal_id != step.expected_child_pal_id or not item.accessible:
            continue
        overlap = tuple(sorted(required.intersection(item.passive_skill_ids)))
        passive_score = len(overlap) / len(required) if required else 1.0
        gender_score = (
            1.0 if step.preferred_gender is None or item.gender == step.preferred_gender else 0.0
        )
        breakdown = {
            "species": 1.0,
            "passive_overlap": passive_score,
            "gender": gender_score,
            "accessibility": 1.0,
            "first_appearance": 1.0,
        }
        score = round(
            breakdown["species"] * 0.30
            + breakdown["passive_overlap"] * 0.40
            + breakdown["gender"] * 0.15
            + breakdown["accessibility"] * 0.10
            + breakdown["first_appearance"] * 0.05,
            6,
        )
        candidate_key = hashlib.sha256(
            "|".join((step.step_id, step.detected_snapshot_id, item.instance_uid)).encode()
        ).hexdigest()
        matches.append(
            CandidateMatch(
                candidate_key=candidate_key,
                pal_instance_uid=item.instance_uid,
                match_score=score,
                matched_passive_ids=overlap,
                match_breakdown=breakdown,
            )
        )
    return tuple(sorted(matches, key=lambda item: (-item.match_score, item.pal_instance_uid)))
