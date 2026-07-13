import asyncio
import signal
from uuid import UUID

import pytest

from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import (
    JobClaim,
    JobExecutionResult,
    JobHeartbeat,
    JobLease,
)
from pal_hatch_helper.workers.job_worker import JobWorker
from pal_hatch_helper.workers.reaper import StaleJobReaper
from pal_hatch_helper.workers.retry import RetryPolicy
from tests.fakes import FakeBreedingJobHandler, FakeJobRepository
from tests.helpers import make_job_claim


def test_two_workers_never_handle_the_same_claim() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeJobRepository([claim])
        handler_a = FakeBreedingJobHandler()
        handler_b = FakeBreedingJobHandler()
        worker_a = JobWorker(repository, handler_a, worker_id="worker-a")
        worker_b = JobWorker(repository, handler_b, worker_id="worker-b")

        processed = await asyncio.gather(worker_a.run_once(), worker_b.run_once())

        assert processed.count(True) == 1
        assert handler_a.handled_job_ids + handler_b.handled_job_ids == [claim.job.job_id]
        assert repository.states[claim.job.job_id] == "completed"

    asyncio.run(scenario())


def test_heartbeats_keep_a_running_job_out_of_stale_recovery() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeJobRepository([claim])
        handler = FakeBreedingJobHandler(delay_seconds=0.08)
        reaper = StaleJobReaper(repository=repository, lease_timeout_seconds=0.03)
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            heartbeat_interval_seconds=0.01,
            lease_timeout_seconds=0.03,
        )

        task = asyncio.create_task(worker.run_once())
        await asyncio.sleep(0.05)
        released = await reaper.reap()
        await task

        assert released == 0
        assert repository.heartbeat_calls >= 2
        assert repository.states[claim.job.job_id] == "completed"

    asyncio.run(scenario())


def test_blocked_heartbeat_cancels_handler_before_the_lease_can_expire() -> None:
    class BlockingHeartbeatRepository(FakeJobRepository):
        async def heartbeat(self, _lease: JobLease) -> JobHeartbeat:
            await asyncio.Future()
            raise AssertionError("unreachable")

    class CancellationAwareHandler:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.cancelled = asyncio.Event()

        async def handle(self, _claim: JobClaim) -> JobExecutionResult:
            self.started.set()
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise
            raise AssertionError("unreachable")

    async def scenario() -> None:
        claim = make_job_claim()
        repository = BlockingHeartbeatRepository([claim])
        handler = CancellationAwareHandler()
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            heartbeat_interval_seconds=0.02,
            heartbeat_request_timeout_seconds=0.03,
            lease_safety_margin_seconds=0.02,
            lease_timeout_seconds=0.15,
        )

        started_at = asyncio.get_running_loop().time()
        await asyncio.wait_for(worker.run_once(), timeout=0.14)
        elapsed = asyncio.get_running_loop().time() - started_at

        assert handler.cancelled.is_set()
        assert elapsed < 0.15
        assert repository.states[claim.job.job_id] == "processing"

    asyncio.run(scenario())


def test_non_retryable_heartbeat_error_cancels_handler_immediately() -> None:
    class InvalidHeartbeatRepository(FakeJobRepository):
        async def heartbeat(self, _lease: JobLease) -> JobHeartbeat:
            raise StructuredError(
                code=ErrorCode.DATABASE_RESPONSE_INVALID,
                summary="invalid heartbeat response",
                retryable=False,
            )

    class CancellationAwareHandler:
        def __init__(self) -> None:
            self.cancelled = asyncio.Event()

        async def handle(self, _claim: JobClaim) -> JobExecutionResult:
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                self.cancelled.set()
                raise
            raise AssertionError("unreachable")

    async def scenario() -> None:
        claim = make_job_claim()
        repository = InvalidHeartbeatRepository([claim])
        handler = CancellationAwareHandler()
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            heartbeat_interval_seconds=0.005,
            heartbeat_request_timeout_seconds=0.01,
            lease_safety_margin_seconds=0.01,
            lease_timeout_seconds=1,
        )

        await asyncio.wait_for(worker.run_once(), timeout=0.1)

        assert handler.cancelled.is_set()
        assert repository.states[claim.job.job_id] == "processing"

    asyncio.run(scenario())


def test_fake_handler_exception_does_not_crash_the_worker() -> None:
    class RaisingOnceHandler:
        def __init__(self) -> None:
            self.calls = 0

        async def handle(self, _claim: JobClaim) -> JobExecutionResult:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("fixture handler crashed")
            return JobExecutionResult.succeeded()

    async def scenario() -> None:
        first_id = UUID("11111111-1111-4111-8111-111111111111")
        second_id = UUID("99999999-9999-4999-8999-999999999999")
        repository = FakeJobRepository(
            [make_job_claim(job_id=first_id), make_job_claim(job_id=second_id)]
        )
        handler = RaisingOnceHandler()
        worker = JobWorker(repository, handler, worker_id="worker-a")

        assert await worker.run_once()
        assert await worker.run_once()

        assert repository.states[first_id] == "retry_pending"
        assert repository.states[second_id] == "completed"

    asyncio.run(scenario())


def test_cancelled_handler_result_uses_cancel_semantics() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeJobRepository([claim])
        handler = FakeBreedingJobHandler(result=JobExecutionResult.cancelled())
        worker = JobWorker(repository, handler, worker_id="worker-a")

        assert await worker.run_once()

        assert repository.states[claim.job.job_id] == "cancelled"

    asyncio.run(scenario())


def test_sigterm_stops_new_claims_and_allows_current_job_to_finish() -> None:
    class ControlledHandler:
        def __init__(self) -> None:
            self.started = asyncio.Event()
            self.finish = asyncio.Event()

        async def handle(self, _claim: JobClaim) -> JobExecutionResult:
            self.started.set()
            await self.finish.wait()
            return JobExecutionResult.succeeded()

    async def scenario() -> None:
        first = make_job_claim()
        second = make_job_claim(job_id=UUID("99999999-9999-4999-8999-999999999999"))
        repository = FakeJobRepository([first, second])
        handler = ControlledHandler()
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            shutdown_grace_seconds=0.2,
        )

        task = asyncio.create_task(worker.run())
        await handler.started.wait()
        worker.handle_signal(signal.SIGTERM)
        handler.finish.set()
        await asyncio.wait_for(task, timeout=1)

        assert repository.states[first.job.job_id] == "completed"
        assert repository.states[second.job.job_id] == "pending"
        assert repository.claim_calls == 1

    asyncio.run(scenario())


def test_sigterm_releases_a_job_that_exceeds_the_shutdown_grace_period() -> None:
    class StuckHandler:
        def __init__(self) -> None:
            self.started = asyncio.Event()

        async def handle(self, _claim: JobClaim) -> JobExecutionResult:
            self.started.set()
            await asyncio.Future()
            raise AssertionError("unreachable")

    async def scenario() -> None:
        claim = make_job_claim(attempt_count=3, max_attempts=3)
        repository = FakeJobRepository([claim])
        handler = StuckHandler()
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            shutdown_grace_seconds=0.01,
        )

        task = asyncio.create_task(worker.run())
        await handler.started.wait()
        worker.handle_signal(signal.SIGTERM)
        await asyncio.wait_for(task, timeout=1)

        assert repository.states[claim.job.job_id] == "retry_pending"

    asyncio.run(scenario())


def test_temporary_database_failures_use_exponential_backoff() -> None:
    async def scenario() -> None:
        repository = FakeJobRepository([], claim_failures=3)
        handler = FakeBreedingJobHandler()
        delays: list[float] = []
        worker: JobWorker

        async def recording_sleep(delay: float) -> None:
            delays.append(delay)
            if len(delays) == 3:
                worker.request_stop()

        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            retry_policy=RetryPolicy(
                initial_delay_seconds=1,
                maximum_delay_seconds=4,
                multiplier=2,
                jitter_ratio=0,
            ),
            sleeper=recording_sleep,
        )

        await worker.run()

        assert delays == [1, 2, 4]

    asyncio.run(scenario())


def test_non_retryable_repository_error_stops_without_backoff() -> None:
    class InvalidResponseRepository(FakeJobRepository):
        async def claim(self, _worker_id: str) -> JobClaim | None:
            raise StructuredError(
                code=ErrorCode.DATABASE_RESPONSE_INVALID,
                summary="invalid database response",
                retryable=False,
            )

    async def scenario() -> None:
        repository = InvalidResponseRepository([])
        delays: list[float] = []
        worker: JobWorker

        async def recording_sleep(delay: float) -> None:
            delays.append(delay)
            worker.request_stop()

        worker = JobWorker(
            repository,
            FakeBreedingJobHandler(),
            worker_id="worker-a",
            sleeper=recording_sleep,
        )

        with pytest.raises(StructuredError) as caught:
            await worker.run()

        assert caught.value.code is ErrorCode.DATABASE_RESPONSE_INVALID
        assert delays == []

    asyncio.run(scenario())


def test_fake_handler_completes_a_full_claim_heartbeat_lifecycle() -> None:
    async def scenario() -> None:
        claim = make_job_claim()
        repository = FakeJobRepository([claim])
        handler = FakeBreedingJobHandler(delay_seconds=0.03)
        worker = JobWorker(
            repository,
            handler,
            worker_id="worker-a",
            heartbeat_interval_seconds=0.005,
            lease_timeout_seconds=0.05,
        )

        assert await worker.run_once()

        assert handler.handled_job_ids == [claim.job.job_id]
        assert repository.heartbeat_calls > 0
        assert repository.states[claim.job.job_id] == "completed"

    asyncio.run(scenario())
