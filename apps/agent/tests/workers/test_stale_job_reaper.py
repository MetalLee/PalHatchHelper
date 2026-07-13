import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from pal_hatch_helper.workers.reaper import StaleJobReaper
from tests.fakes import FakeJobRepository
from tests.helpers import make_job_claim


def test_stale_lease_retries_then_fails_at_max_attempts() -> None:
    async def scenario() -> None:
        retry_job_id = UUID("11111111-1111-4111-8111-111111111111")
        final_job_id = UUID("99999999-9999-4999-8999-999999999999")
        repository = FakeJobRepository(
            [
                make_job_claim(job_id=retry_job_id, attempt_count=1, max_attempts=3),
                make_job_claim(job_id=final_job_id, attempt_count=3, max_attempts=3),
            ]
        )
        retry_claim = await repository.claim("worker-a")
        final_claim = await repository.claim("worker-b")
        assert retry_claim is not None
        assert final_claim is not None
        expired_at = datetime.now(UTC) - timedelta(minutes=5)
        repository.expire(retry_job_id, expired_at)
        repository.expire(final_job_id, expired_at)
        reaper = StaleJobReaper(repository=repository, lease_timeout_seconds=30)

        released = await reaper.reap()

        assert released == 2
        assert repository.states[retry_job_id] == "retry_pending"
        assert repository.states[final_job_id] == "failed"

    asyncio.run(scenario())
