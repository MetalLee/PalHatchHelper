from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from pal_hatch_helper.generated import CandidateDetectionWrite
from pal_hatch_helper.plans.candidates import (
    CandidateDetectionStep,
    SnapshotDeltaReader,
    rank_offspring_candidates,
)
from pal_hatch_helper.repositories.execution_plans import ExecutionPlanRepository


class PublishedSnapshotProcessor(Protocol):
    async def process_snapshot(self, snapshot_id: UUID) -> None: ...


class CandidateDetectionProcessor:
    def __init__(self, repository: ExecutionPlanRepository) -> None:
        self._repository = repository
        self._delta_reader = SnapshotDeltaReader()

    async def process_snapshot(self, snapshot_id: UUID) -> None:
        contexts = await self._repository.detection_contexts(snapshot_id)
        for context in contexts:
            baseline, current, seen = await self._repository.snapshot_delta(
                context.step_id, snapshot_id
            )
            new_instances = self._delta_reader.new_instances(
                baseline=baseline,
                current=current,
                seen_before_or_at_baseline=seen,
            )
            ranked = rank_offspring_candidates(
                CandidateDetectionStep(
                    step_id=str(context.step_id),
                    expected_child_pal_id=context.expected_child_pal_id,
                    required_passive_ids=tuple(context.required_passive_ids),
                    preferred_gender=context.preferred_gender,
                    detected_snapshot_id=str(snapshot_id),
                    detected_at=_context_timestamp(),
                ),
                new_instances,
            )
            candidates = tuple(
                CandidateDetectionWrite(
                    pal_instance_uid=candidate.pal_instance_uid,
                    match_score=candidate.match_score,
                    match_breakdown=candidate.match_breakdown,
                )
                for candidate in ranked
            )
            await self._repository.record_candidates(context.step_id, snapshot_id, candidates)
        await self._repository.invalidate_dependencies(snapshot_id)


def _context_timestamp() -> datetime:
    # Detection time is the immutable snapshot timestamp in the database RPC. The
    # pure matcher needs an aware value only to keep its context explicit.
    return datetime.now(UTC)
