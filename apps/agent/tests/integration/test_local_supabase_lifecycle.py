import asyncio
import os
from urllib.parse import urlparse
from uuid import UUID

import httpx
import pytest
from pydantic import SecretStr

from pal_hatch_helper.models.jobs import JobClaim, JobExecutionResult
from pal_hatch_helper.repositories.database import SupabaseDatabaseClient
from pal_hatch_helper.repositories.jobs import SupabaseJobRepository
from pal_hatch_helper.workers.job_worker import JobWorker

pytestmark = pytest.mark.integration
TARGET_JOB_ID = UUID("60000000-0000-4000-8000-000000000001")


def test_fake_handler_completes_a_job_through_local_supabase_rpcs() -> None:
    supabase_url = os.environ.get("TEST_SUPABASE_URL")
    service_role = os.environ.get("TEST_SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_role:
        pytest.skip("reset local Supabase credentials are not configured")
    if urlparse(supabase_url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        pytest.fail("integration test refuses non-loopback Supabase URLs")

    class CapturingFakeHandler:
        def __init__(self) -> None:
            self.claims: list[JobClaim] = []

        async def handle(self, claim: JobClaim) -> JobExecutionResult:
            self.claims.append(claim)
            await asyncio.sleep(0.03)
            return JobExecutionResult.succeeded()

    async def scenario() -> None:
        database = SupabaseDatabaseClient(
            base_url=supabase_url,
            service_role_key=SecretStr(service_role),
        )
        repository = SupabaseJobRepository(database)
        handler = CapturingFakeHandler()
        worker = JobWorker(
            repository,
            handler,
            worker_id="phase2-local-integration-worker",
            heartbeat_interval_seconds=0.005,
            lease_timeout_seconds=0.05,
        )
        try:
            assert await worker.run_once()
            target_claim = handler.claims[-1]
            assert target_claim.job.job_id == TARGET_JOB_ID
            assert target_claim.lease.lease_token is not None
            persisted_job = await read_job_status(
                supabase_url=supabase_url,
                service_role=service_role,
                job_id=TARGET_JOB_ID,
            )
            assert persisted_job == {
                "status": "completed",
                "locked_by": None,
                "lease_token": None,
            }
        finally:
            await database.close()

    asyncio.run(scenario())


async def read_job_status(
    *,
    supabase_url: str,
    service_role: str,
    job_id: UUID,
) -> dict[str, object]:
    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.get(
            f"{supabase_url}/rest/v1/breeding_jobs",
            headers={
                "apikey": service_role,
                "Authorization": f"Bearer {service_role}",
            },
            params={
                "id": f"eq.{job_id}",
                "select": "status,locked_by,lease_token",
            },
        )
        response.raise_for_status()
        payload = response.json()
        assert isinstance(payload, list) and len(payload) == 1
        row = payload[0]
        assert isinstance(row, dict)
        return row
