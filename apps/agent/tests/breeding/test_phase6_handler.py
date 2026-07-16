import asyncio
from dataclasses import dataclass, field

from pal_hatch_helper.breeding.engine import DeterministicBreedingEngine
from pal_hatch_helper.breeding.phase6_handler import Phase6BreedingJobHandler
from pal_hatch_helper.generated import (
    AIExplanationRequest,
    AIExplanationResult,
    AIRouteExplanation,
    BreedingEngineResult,
)
from pal_hatch_helper.models.jobs import JobClaim
from tests.helpers import make_job_claim

from .factories import inventory_pal, recipe, request, search


def _result(claim: JobClaim, *, route_count: int = 1) -> BreedingEngineResult:
    base = search(
        DeterministicBreedingEngine(),
        request(
            "test_target_pal",
            (
                inventory_pal("owned-a", "pal-a", "male", passives=("test_passive_a",)),
                inventory_pal("owned-b", "pal-b", "female"),
            ),
            desired_passive_ids=("test_passive_a",),
        ),
        (recipe("pal-a", "pal-b", "test_target_pal"),),
    )
    routes = []
    for index in range(route_count):
        template = base.routes[0]
        routes.append(
            template.model_copy(update={"rank": index + 1, "route_key": f"{index + 1:064x}"})
        )
    return base.model_copy(
        update={
            "inventory_snapshot_id": claim.job.inventory_snapshot_id,
            "game_data_version_id": claim.job.game_data_version_id,
            "game_data_content_hash": claim.job.game_data_content_hash,
            "routes": routes,
            "result_digest": "f" * 64,
        }
    )


class FakeAdapter:
    def __init__(self, result: BreedingEngineResult) -> None:
        self.result = result

    async def execute(self, _claim: JobClaim) -> BreedingEngineResult:
        return self.result


@dataclass
class FakeResultRepository:
    events: list[str] = field(default_factory=list)
    algorithm_result: BreedingEngineResult | None = None
    ai_result: AIExplanationResult | None = None

    async def persist_algorithm(self, _claim: JobClaim, result: BreedingEngineResult) -> None:
        self.events.append("algorithm")
        self.algorithm_result = result

    async def persist_ai(self, _claim: JobClaim, result: AIExplanationResult) -> None:
        self.events.append("ai")
        self.ai_result = result


class CapturingAIProvider:
    def __init__(self) -> None:
        self.request: AIExplanationRequest | None = None

    async def explain(self, request_value: AIExplanationRequest) -> AIExplanationResult:
        self.request = request_value
        return AIExplanationResult(
            provider="template",
            model=None,
            degraded=True,
            explanation="本地模板解释。",
            route_explanations=[
                AIRouteExplanation(
                    route_key=route.route_key,
                    explanation=f"路线 {route.rank}",
                    labels=["确定性路线"],
                )
                for route in request_value.routes
            ],
        )


def test_handler_persists_algorithm_before_ai_and_keeps_only_three_routes() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeResultRepository()
        ai_provider = CapturingAIProvider()
        handler = Phase6BreedingJobHandler(
            FakeAdapter(_result(claim, route_count=4)),
            repository,
            ai_provider,
        )

        execution = await handler.handle(claim)

        assert execution.error is None
        assert repository.events == ["algorithm", "ai"]
        assert repository.algorithm_result is not None
        assert len(repository.algorithm_result.routes) == 3
        assert repository.ai_result is not None
        assert ai_provider.request is not None
        assert len(ai_provider.request.routes) == 3

    asyncio.run(scenario())


def test_ai_request_contains_no_inventory_instances_users_worlds_or_paths() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        ai_provider = CapturingAIProvider()
        handler = Phase6BreedingJobHandler(
            FakeAdapter(_result(claim)),
            FakeResultRepository(),
            ai_provider,
        )

        await handler.handle(claim)

        assert ai_provider.request is not None
        serialized = ai_provider.request.model_dump_json()
        assert "owned-a" not in serialized
        assert str(claim.job.requester_user_id) not in serialized
        assert str(claim.job.player_id) not in serialized
        assert str(claim.job.world_id) not in serialized
        assert str(claim.job.inventory_snapshot_id) not in serialized
        assert "/opt/" not in serialized

    asyncio.run(scenario())


def test_no_legal_route_is_still_a_successful_algorithm_result() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        result = _result(claim).model_copy(update={"routes": [], "result_digest": "e" * 64})
        repository = FakeResultRepository()
        handler = Phase6BreedingJobHandler(FakeAdapter(result), repository, CapturingAIProvider())

        execution = await handler.handle(claim)

        assert execution.error is None
        assert repository.algorithm_result is not None
        assert repository.algorithm_result.routes == []
        assert repository.ai_result is not None

    asyncio.run(scenario())


def test_ai_failure_falls_back_to_template_after_algorithm_persistence() -> None:
    class FailingAIProvider:
        async def explain(self, _request_value: AIExplanationRequest) -> AIExplanationResult:
            raise RuntimeError("fixture provider outage")

    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeResultRepository()
        handler = Phase6BreedingJobHandler(
            FakeAdapter(_result(claim)),
            repository,
            FailingAIProvider(),
        )

        execution = await handler.handle(claim)

        assert execution.error is None
        assert repository.events == ["algorithm", "ai"]
        assert repository.ai_result is not None
        assert repository.ai_result.provider == "template"
        assert repository.ai_result.degraded

    asyncio.run(scenario())
