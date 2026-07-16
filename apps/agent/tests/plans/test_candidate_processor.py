import asyncio
from uuid import UUID

from pal_hatch_helper.generated import CandidateDetectionWrite, DetectionStepContext
from pal_hatch_helper.plans.candidates import SnapshotPal
from pal_hatch_helper.plans.processor import CandidateDetectionProcessor

STEP_ID = UUID("72000000-0000-4000-8000-000000000001")
PLAN_ID = UUID("71000000-0000-4000-8000-000000000001")
WORLD_ID = UUID("10000000-0000-4000-8000-000000000001")
BASELINE_ID = UUID("40000000-0000-4000-8000-000000000002")
SNAPSHOT_ID = UUID("40000000-0000-4000-8000-000000000003")


def _pal(uid: str, species: str, passives: tuple[str, ...]) -> SnapshotPal:
    return SnapshotPal(
        instance_uid=uid,
        pal_id=species,
        gender="female",
        passive_skill_ids=passives,
        level=1,
        owner_display_name="Fixture Player A",
        location_type="base",
        location_name="Fixture Breeding Base",
        accessible=True,
    )


class FakeExecutionPlanRepository:
    def __init__(self) -> None:
        self.processed: set[tuple[UUID, UUID]] = set()
        self.writes: list[tuple[CandidateDetectionWrite, ...]] = []
        self.invalidations: list[UUID] = []

    async def detection_contexts(self, snapshot_id: UUID) -> tuple[DetectionStepContext, ...]:
        if (STEP_ID, snapshot_id) in self.processed:
            return ()
        return (
            DetectionStepContext(
                step_id=STEP_ID,
                plan_id=PLAN_ID,
                world_id=WORLD_ID,
                baseline_snapshot_id=BASELINE_ID,
                expected_child_pal_id="test_child_pal",
                required_passive_ids=["test_passive_a", "test_passive_b"],
                preferred_gender="female",
            ),
        )

    async def snapshot_delta(
        self, step_id: UUID, snapshot_id: UUID
    ) -> tuple[tuple[SnapshotPal, ...], tuple[SnapshotPal, ...], frozenset[str]]:
        assert step_id == STEP_ID
        assert snapshot_id == SNAPSHOT_ID
        baseline = (_pal("parent", "test_parent_a", ("test_passive_a",)),)
        current = (
            baseline[0],
            _pal("candidate-weaker", "test_child_pal", ("test_passive_a",)),
            _pal(
                "candidate-best",
                "test_child_pal",
                ("test_passive_a", "test_passive_b"),
            ),
            _pal("wrong-species", "test_parent_b", ()),
        )
        return baseline, current, frozenset({"parent"})

    async def record_candidates(
        self,
        step_id: UUID,
        snapshot_id: UUID,
        candidates: tuple[CandidateDetectionWrite, ...],
    ) -> int:
        assert step_id == STEP_ID
        self.processed.add((step_id, snapshot_id))
        self.writes.append(candidates)
        return len(candidates)

    async def invalidate_dependencies(self, snapshot_id: UUID) -> int:
        self.invalidations.append(snapshot_id)
        return 0


def test_processor_ranks_candidates_and_recovers_idempotently_after_restart() -> None:
    async def scenario() -> None:
        repository = FakeExecutionPlanRepository()

        await CandidateDetectionProcessor(repository).process_snapshot(SNAPSHOT_ID)
        await CandidateDetectionProcessor(repository).process_snapshot(SNAPSHOT_ID)

        assert len(repository.writes) == 1
        assert [item.pal_instance_uid for item in repository.writes[0]] == [
            "candidate-best",
            "candidate-weaker",
        ]
        assert repository.writes[0][0].match_score > repository.writes[0][1].match_score
        assert repository.invalidations == [SNAPSHOT_ID, SNAPSHOT_ID]

    asyncio.run(scenario())
