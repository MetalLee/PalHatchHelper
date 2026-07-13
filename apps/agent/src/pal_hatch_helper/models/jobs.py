from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from pal_hatch_helper.generated.contracts import BreedingJob
from pal_hatch_helper.models.errors import ErrorCode, StructuredError


class JobLease(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    worker_id: str = Field(min_length=1, max_length=128)
    lease_token: UUID
    locked_at: AwareDatetime
    heartbeat_at: AwareDatetime
    attempt_count: int = Field(ge=1)
    max_attempts: int = Field(ge=1, le=20)

    @property
    def has_attempts_remaining(self) -> bool:
        return self.attempt_count < self.max_attempts


class JobClaim(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job: BreedingJob
    lease: JobLease

    def with_worker(self, worker_id: str) -> "JobClaim":
        return self.model_copy(
            update={"lease": self.lease.model_copy(update={"worker_id": worker_id})}
        )


class JobHeartbeat(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    job_id: UUID
    worker_id: str = Field(min_length=1, max_length=128)
    heartbeat_at: AwareDatetime


class JobOutcome(StrEnum):
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True, slots=True)
class JobExecutionResult:
    outcome: JobOutcome
    error: StructuredError | None = None

    @classmethod
    def succeeded(cls) -> "JobExecutionResult":
        return cls(outcome=JobOutcome.SUCCEEDED)

    @classmethod
    def failed(cls, error: StructuredError) -> "JobExecutionResult":
        return cls(outcome=JobOutcome.FAILED, error=error)

    @classmethod
    def cancelled(cls) -> "JobExecutionResult":
        return cls(
            outcome=JobOutcome.CANCELLED,
            error=StructuredError(
                code=ErrorCode.JOB_CANCELLED,
                summary="Breeding job execution was cancelled.",
                retryable=False,
            ),
        )


def heartbeat_now(*, lease: JobLease, timestamp: datetime) -> JobHeartbeat:
    return JobHeartbeat(
        job_id=lease.job_id,
        worker_id=lease.worker_id,
        heartbeat_at=timestamp,
    )
