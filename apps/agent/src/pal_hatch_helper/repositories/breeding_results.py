from typing import Protocol, TypeGuard

from pal_hatch_helper.generated import AIExplanationResult, BreedingEngineResult
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


class BreedingResultRepository(Protocol):
    async def persist_algorithm(
        self,
        claim: JobClaim,
        result: BreedingEngineResult,
    ) -> None: ...

    async def persist_ai(
        self,
        claim: JobClaim,
        result: AIExplanationResult,
    ) -> None: ...


class SupabaseBreedingResultRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def persist_algorithm(
        self,
        claim: JobClaim,
        result: BreedingEngineResult,
    ) -> None:
        payload = await self._database.rpc(
            "persist_breeding_algorithm_result",
            {
                "p_job_id": str(claim.job.job_id),
                "p_worker_id": claim.lease.worker_id,
                "p_lease_token": str(claim.lease.lease_token),
                "p_result": _json_object(result.model_dump(mode="json")),
            },
        )
        if not isinstance(payload, str):
            raise _invalid_response()

    async def persist_ai(
        self,
        claim: JobClaim,
        result: AIExplanationResult,
    ) -> None:
        payload = await self._database.rpc(
            "persist_breeding_ai_result",
            {
                "p_job_id": str(claim.job.job_id),
                "p_worker_id": claim.lease.worker_id,
                "p_lease_token": str(claim.lease.lease_token),
                "p_provider": result.provider.value,
                "p_model": result.model,
                "p_explanation": result.explanation,
                "p_degraded": result.degraded,
                "p_route_explanations": [
                    _json_object(value.model_dump(mode="json"))
                    for value in result.route_explanations
                ],
            },
        )
        if payload is not True:
            raise _invalid_response()


def _json_object(value: object) -> dict[str, JSONValue]:
    if not _is_json_object(value):
        raise TypeError("expected JSON object")
    return value


def _is_json_value(value: object) -> TypeGuard[JSONValue]:
    if value is None or isinstance(value, str | int | float | bool):
        return True
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_value(item) for key, item in value.items())
    return False


def _is_json_object(value: object) -> TypeGuard[dict[str, JSONValue]]:
    return isinstance(value, dict) and _is_json_value(value)


def _invalid_response() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Supabase returned an invalid breeding result response.",
        retryable=False,
    )
