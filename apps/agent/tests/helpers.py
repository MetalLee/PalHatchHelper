from datetime import UTC, datetime
from typing import cast
from uuid import UUID

from pal_hatch_helper.generated.contracts import BreedingJob, OptimizationMode
from pal_hatch_helper.models.jobs import JobClaim, JobLease
from pal_hatch_helper.repositories.database import JSONValue

DEFAULT_JOB_ID = UUID("11111111-1111-4111-8111-111111111111")
DEFAULT_LEASE_TOKEN = UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")


def make_job_claim(
    *,
    job_id: UUID = DEFAULT_JOB_ID,
    worker_id: str = "worker-a",
    lease_token: UUID = DEFAULT_LEASE_TOKEN,
    attempt_count: int = 1,
    max_attempts: int = 3,
) -> JobClaim:
    now = datetime.now(UTC)
    job = BreedingJob(
        job_id=job_id,
        requester_user_id=UUID("22222222-2222-4222-8222-222222222222"),
        world_id=UUID("77777777-7777-4777-8777-777777777777"),
        player_id=UUID("33333333-3333-4333-8333-333333333333"),
        guild_id=UUID("44444444-4444-4444-8444-444444444444"),
        target_pal_id="test_target_pal",
        desired_passive_ids=["test_passive_a"],
        optimization_mode=OptimizationMode.BALANCED,
        inventory_snapshot_id=UUID("55555555-5555-4555-8555-555555555555"),
        game_data_version_id=UUID("66666666-6666-4666-8666-666666666666"),
        breeding_data_version_id=UUID("66666666-6666-4666-8666-666666666666"),
        game_data_content_hash="a" * 64,
        algorithm_version="inventory-trait-aware-deterministic-v3",
        scoring_profile_version="balanced-v4",
        allow_guild_shared=True,
        max_generations=5,
        status="processing",
        attempt_count=attempt_count,
        error_code=None,
        created_at=now,
        completed_at=None,
    )
    return JobClaim(
        job=job,
        lease=JobLease(
            job_id=job_id,
            worker_id=worker_id,
            lease_token=lease_token,
            locked_at=now,
            heartbeat_at=now,
            attempt_count=attempt_count,
            max_attempts=max_attempts,
        ),
    )


def make_claim_row(
    *,
    job_id: UUID = DEFAULT_JOB_ID,
    worker_id: str = "worker-a",
    lease_token: UUID = DEFAULT_LEASE_TOKEN,
    attempt_count: int = 1,
    max_attempts: int = 3,
) -> dict[str, JSONValue]:
    claim = make_job_claim(
        job_id=job_id,
        worker_id=worker_id,
        lease_token=lease_token,
        attempt_count=attempt_count,
        max_attempts=max_attempts,
    )
    return {
        "id": str(claim.job.job_id),
        "requester_user_id": str(claim.job.requester_user_id),
        "world_id": str(claim.job.world_id),
        "player_id": str(claim.job.player_id),
        "guild_id": str(claim.job.guild_id),
        "target_pal_id": claim.job.target_pal_id,
        "desired_passive_ids": cast(list[JSONValue], claim.job.desired_passive_ids),
        "optimization_mode": claim.job.optimization_mode.value,
        "inventory_snapshot_id": str(claim.job.inventory_snapshot_id),
        "game_data_version_id": str(claim.job.game_data_version_id),
        "breeding_data_version_id": str(claim.job.breeding_data_version_id),
        "game_data_content_hash": claim.job.game_data_content_hash,
        "algorithm_version": claim.job.algorithm_version,
        "scoring_profile_version": claim.job.scoring_profile_version,
        "allow_guild_shared": claim.job.allow_guild_shared,
        "max_generations": claim.job.max_generations,
        "status": claim.job.status.value,
        "request_fingerprint": "1" * 64,
        "idempotency_key": "fixture-job",
        "locked_by": worker_id,
        "lease_token": str(lease_token),
        "locked_at": claim.lease.locked_at.isoformat(),
        "heartbeat_at": claim.lease.heartbeat_at.isoformat(),
        "attempt_count": attempt_count,
        "max_attempts": max_attempts,
        "error_code": None,
        "error_summary": None,
        "created_at": claim.job.created_at.isoformat(),
        "updated_at": claim.job.created_at.isoformat(),
        "completed_at": None,
    }
