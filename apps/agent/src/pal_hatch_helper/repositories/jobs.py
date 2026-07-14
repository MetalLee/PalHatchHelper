from collections.abc import Mapping
from datetime import datetime
from typing import Protocol

from pydantic import ValidationError

from pal_hatch_helper.generated.contracts import BreedingJob, BreedingJobStatus
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim, JobHeartbeat, JobLease
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


class JobRepository(Protocol):
    async def claim(self, worker_id: str) -> JobClaim | None: ...

    async def heartbeat(self, lease: JobLease) -> JobHeartbeat: ...

    async def complete(self, lease: JobLease) -> None: ...

    async def fail(
        self,
        lease: JobLease,
        error: StructuredError,
    ) -> BreedingJobStatus: ...

    async def cancel(self, lease: JobLease, error: StructuredError) -> None: ...

    async def release(
        self,
        lease: JobLease,
        error: StructuredError,
    ) -> BreedingJobStatus: ...

    async def release_stale(self, stale_before: datetime) -> int: ...


class SupabaseJobRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def claim(self, worker_id: str) -> JobClaim | None:
        payload = await self._database.rpc(
            "claim_breeding_job",
            {"p_worker_id": worker_id},
        )
        if not isinstance(payload, list) or len(payload) > 1:
            raise _invalid_response("claim_breeding_job")
        if not payload:
            return None
        row = payload[0]
        if not isinstance(row, dict):
            raise _invalid_response("claim_breeding_job")
        return _parse_claim(row)

    async def heartbeat(self, lease: JobLease) -> JobHeartbeat:
        result = await self._database.rpc(
            "heartbeat_breeding_job",
            _lease_parameters(lease),
        )
        if result is not True:
            raise _invalid_response("heartbeat_breeding_job")
        from datetime import UTC, datetime

        return JobHeartbeat(
            job_id=lease.job_id,
            worker_id=lease.worker_id,
            heartbeat_at=datetime.now(UTC),
        )

    async def complete(self, lease: JobLease) -> None:
        result = await self._database.rpc(
            "complete_breeding_job",
            _lease_parameters(lease),
        )
        if result is not True:
            raise _invalid_response("complete_breeding_job")

    async def fail(
        self,
        lease: JobLease,
        error: StructuredError,
    ) -> BreedingJobStatus:
        result = await self._database.rpc(
            "fail_breeding_job",
            {
                **_lease_parameters(lease),
                "p_error_code": error.code.value,
                "p_retryable": error.retryable,
                "p_error_summary": error.summary,
            },
        )
        return _parse_status(result, allowed={"retry_pending", "failed"})

    async def cancel(self, lease: JobLease, error: StructuredError) -> None:
        result = await self._database.rpc(
            "cancel_breeding_job",
            {
                **_lease_parameters(lease),
                "p_error_code": error.code.value,
            },
        )
        if result is not True:
            raise _invalid_response("cancel_breeding_job")

    async def release(
        self,
        lease: JobLease,
        error: StructuredError,
    ) -> BreedingJobStatus:
        result = await self._database.rpc(
            "release_breeding_job",
            {
                **_lease_parameters(lease),
                "p_error_code": error.code.value,
            },
        )
        return _parse_status(result, allowed={"retry_pending"})

    async def release_stale(self, stale_before: datetime) -> int:
        result = await self._database.rpc(
            "release_stale_breeding_jobs",
            {"p_stale_before": stale_before.isoformat()},
        )
        if not isinstance(result, int) or isinstance(result, bool) or result < 0:
            raise _invalid_response("release_stale_breeding_jobs")
        return result


def _parse_claim(row: Mapping[str, JSONValue]) -> JobClaim:
    try:
        job = BreedingJob.model_validate(
            {
                "job_id": row.get("id"),
                "requester_user_id": row.get("requester_user_id"),
                "world_id": row.get("world_id"),
                "player_id": row.get("player_id"),
                "guild_id": row.get("guild_id"),
                "target_pal_id": row.get("target_pal_id"),
                "desired_passive_ids": row.get("desired_passive_ids"),
                "optimization_mode": row.get("optimization_mode"),
                "inventory_snapshot_id": row.get("inventory_snapshot_id"),
                "game_data_version_id": row.get("game_data_version_id"),
                "breeding_data_version_id": row.get("breeding_data_version_id"),
                "algorithm_version": row.get("algorithm_version"),
                "scoring_profile_version": row.get("scoring_profile_version"),
                "status": row.get("status"),
                "attempt_count": row.get("attempt_count"),
                "error_code": row.get("error_code"),
                "created_at": row.get("created_at"),
                "completed_at": row.get("completed_at"),
            }
        )
        lease = JobLease.model_validate(
            {
                "job_id": row.get("id"),
                "worker_id": row.get("locked_by"),
                "lease_token": row.get("lease_token"),
                "locked_at": row.get("locked_at"),
                "heartbeat_at": row.get("heartbeat_at"),
                "attempt_count": row.get("attempt_count"),
                "max_attempts": row.get("max_attempts"),
            }
        )
    except ValidationError as error:
        raise _invalid_response("claim_breeding_job") from error
    return JobClaim(job=job, lease=lease)


def _lease_parameters(lease: JobLease) -> dict[str, JSONValue]:
    return {
        "p_job_id": str(lease.job_id),
        "p_worker_id": lease.worker_id,
        "p_lease_token": str(lease.lease_token),
    }


def _parse_status(result: JSONValue, *, allowed: set[str]) -> BreedingJobStatus:
    if not isinstance(result, str) or result not in allowed:
        raise _invalid_response("job_status")
    return BreedingJobStatus(result)


def _invalid_response(function_name: str) -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary=f"{function_name} returned an invalid response.",
        retryable=False,
    )
