import asyncio
from collections import deque
from datetime import UTC, datetime
from uuid import UUID

from pal_hatch_helper.generated.contracts import BreedingJobStatus
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import (
    JobClaim,
    JobExecutionResult,
    JobHeartbeat,
    JobLease,
)


class FakeJobRepository:
    def __init__(
        self,
        claims: list[JobClaim],
        *,
        claim_failures: int = 0,
    ) -> None:
        self._claims = deque(claims)
        self._claim_lock = asyncio.Lock()
        self._active: dict[UUID, JobLease] = {}
        self._heartbeats: dict[UUID, datetime] = {}
        self.claim_failures = claim_failures
        self.claim_calls = 0
        self.heartbeat_calls = 0
        self.states: dict[UUID, str] = {claim.job.job_id: "pending" for claim in claims}
        self.failures: dict[UUID, StructuredError] = {}

    async def claim(self, worker_id: str) -> JobClaim | None:
        async with self._claim_lock:
            self.claim_calls += 1
            if self.claim_failures > 0:
                self.claim_failures -= 1
                raise StructuredError(
                    code=ErrorCode.DATABASE_UNAVAILABLE,
                    summary="temporary database outage",
                    retryable=True,
                )
            if not self._claims:
                return None
            claim = self._claims.popleft().with_worker(worker_id)
            self._active[claim.job.job_id] = claim.lease
            self._heartbeats[claim.job.job_id] = claim.lease.heartbeat_at
            self.states[claim.job.job_id] = "processing"
            return claim

    async def heartbeat(self, lease: JobLease) -> JobHeartbeat:
        if self._active.get(lease.job_id) != lease:
            raise StructuredError(
                code=ErrorCode.JOB_LOCK_NOT_OWNED,
                summary="lease lost",
                retryable=False,
            )
        self.heartbeat_calls += 1
        heartbeat_at = datetime.now(UTC)
        self._heartbeats[lease.job_id] = heartbeat_at
        return JobHeartbeat(
            job_id=lease.job_id,
            worker_id=lease.worker_id,
            heartbeat_at=heartbeat_at,
        )

    async def complete(self, lease: JobLease) -> None:
        self._assert_active(lease)
        self.states[lease.job_id] = "completed"
        self._active.pop(lease.job_id)

    async def fail(self, lease: JobLease, error: StructuredError) -> BreedingJobStatus:
        self._assert_active(lease)
        status = "retry_pending" if error.retryable and lease.has_attempts_remaining else "failed"
        self.states[lease.job_id] = status
        self.failures[lease.job_id] = error
        self._active.pop(lease.job_id)
        return BreedingJobStatus(status)

    async def cancel(self, lease: JobLease, error: StructuredError) -> None:
        self._assert_active(lease)
        self.states[lease.job_id] = "cancelled"
        self.failures[lease.job_id] = error
        self._active.pop(lease.job_id)

    async def release(self, lease: JobLease, error: StructuredError) -> BreedingJobStatus:
        self._assert_active(lease)
        self.states[lease.job_id] = "retry_pending"
        self.failures[lease.job_id] = error
        self._active.pop(lease.job_id)
        return BreedingJobStatus.RETRY_PENDING

    async def release_stale(self, stale_before: datetime) -> int:
        stale_ids = [
            job_id
            for job_id, heartbeat_at in self._heartbeats.items()
            if job_id in self._active and heartbeat_at < stale_before
        ]
        for job_id in stale_ids:
            lease = self._active.pop(job_id)
            self.states[job_id] = "retry_pending" if lease.has_attempts_remaining else "failed"
        return len(stale_ids)

    def expire(self, job_id: UUID, heartbeat_at: datetime) -> None:
        self._heartbeats[job_id] = heartbeat_at

    def _assert_active(self, lease: JobLease) -> None:
        if self._active.get(lease.job_id) != lease:
            raise StructuredError(
                code=ErrorCode.JOB_LOCK_NOT_OWNED,
                summary="lease lost",
                retryable=False,
            )


class FakeBreedingJobHandler:
    def __init__(
        self,
        *,
        result: JobExecutionResult | None = None,
        delay_seconds: float = 0,
    ) -> None:
        self.result = result or JobExecutionResult.succeeded()
        self.delay_seconds = delay_seconds
        self.handled_job_ids: list[UUID] = []

    async def handle(self, claim: JobClaim) -> JobExecutionResult:
        self.handled_job_ids.append(claim.job.job_id)
        if self.delay_seconds:
            await asyncio.sleep(self.delay_seconds)
        return self.result
