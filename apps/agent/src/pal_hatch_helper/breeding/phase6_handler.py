from typing import Protocol

from pydantic import ValidationError

from pal_hatch_helper.ai.providers import AIProvider, TemplateProvider
from pal_hatch_helper.generated import (
    AIExplanationRequest,
    AIExplanationRouteSummary,
    BreedingEngineResult,
    RouteScoreBreakdown,
)
from pal_hatch_helper.models.jobs import JobClaim, JobExecutionResult
from pal_hatch_helper.repositories.breeding_results import BreedingResultRepository


class BreedingAlgorithm(Protocol):
    async def execute(self, claim: JobClaim) -> BreedingEngineResult: ...


class Phase6BreedingJobHandler:
    def __init__(
        self,
        algorithm: BreedingAlgorithm,
        repository: BreedingResultRepository,
        ai_provider: AIProvider,
    ) -> None:
        self._algorithm = algorithm
        self._repository = repository
        self._ai_provider = ai_provider

    async def handle(self, claim: JobClaim) -> JobExecutionResult:
        full_result = await self._algorithm.execute(claim)
        selected = sorted(full_result.routes, key=lambda route: (route.rank, route.route_key))[:3]
        result = full_result.model_copy(update={"routes": selected})
        await self._repository.persist_algorithm(claim, result)
        request = _explanation_request(claim, result)
        try:
            explanation = await self._ai_provider.explain(request)
        except Exception:
            explanation = await TemplateProvider().explain(request)
        await self._repository.persist_ai(claim, explanation)
        return JobExecutionResult.succeeded()


def _explanation_request(
    claim: JobClaim,
    result: BreedingEngineResult,
) -> AIExplanationRequest:
    summaries: list[AIExplanationRouteSummary] = []
    for route in result.routes:
        pal_ids: set[str] = set()
        for step in route.steps:
            pal_ids.update((step.parent_a.pal_id, step.parent_b.pal_id, step.child_pal_id))
        try:
            breakdown = RouteScoreBreakdown.model_validate(
                route.score_breakdown.model_dump(mode="json")
            )
        except ValidationError as error:
            raise ValueError("deterministic score breakdown contract drift") from error
        summaries.append(
            AIExplanationRouteSummary(
                route_key=route.route_key,
                rank=route.rank,
                total_score=route.total_score,
                generation_count=route.generation_count,
                borrowed_pal_count=route.borrowed_pal_count,
                inventory_coverage=route.inventory_coverage,
                difficulty=route.difficulty.value,
                pal_sequence=sorted(pal_ids),
                score_breakdown=breakdown,
            )
        )
    return AIExplanationRequest(
        target_pal_id=result.target_pal_id,
        desired_passive_ids=result.desired_passive_ids,
        optimization_mode=result.optimization_mode.value,
        version_summary={
            "game_data_content_hash": claim.job.game_data_content_hash,
            "algorithm_version": claim.job.algorithm_version,
            "scoring_profile_version": claim.job.scoring_profile_version,
        },
        routes=summaries,
    )
