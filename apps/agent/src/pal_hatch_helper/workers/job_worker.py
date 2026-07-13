import asyncio
import contextlib
import logging
import signal
import time
from collections.abc import Awaitable, Callable

from pal_hatch_helper.breeding.handler import BreedingJobHandler
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.models.jobs import JobClaim, JobExecutionResult, JobOutcome
from pal_hatch_helper.repositories.jobs import JobRepository
from pal_hatch_helper.workers.reaper import StaleJobReaper
from pal_hatch_helper.workers.retry import RetryPolicy

Sleeper = Callable[[float], Awaitable[None]]


class JobWorker:
    def __init__(
        self,
        repository: JobRepository,
        handler: BreedingJobHandler,
        *,
        worker_id: str,
        poll_interval_seconds: float = 2,
        heartbeat_interval_seconds: float = 10,
        heartbeat_request_timeout_seconds: float | None = None,
        lease_timeout_seconds: float = 30,
        lease_safety_margin_seconds: float | None = None,
        shutdown_grace_seconds: float = 30,
        stale_reap_interval_seconds: float = 15,
        stale_job_reaper: StaleJobReaper | None = None,
        retry_policy: RetryPolicy | None = None,
        sleeper: Sleeper = asyncio.sleep,
        logger: logging.Logger | None = None,
    ) -> None:
        self._repository = repository
        self._handler = handler
        self._worker_id = worker_id
        self._poll_interval_seconds = poll_interval_seconds
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._heartbeat_request_timeout_seconds = (
            heartbeat_request_timeout_seconds
            if heartbeat_request_timeout_seconds is not None
            else min(10.0, lease_timeout_seconds / 4)
        )
        self._lease_timeout_seconds = lease_timeout_seconds
        self._lease_safety_margin_seconds = (
            lease_safety_margin_seconds
            if lease_safety_margin_seconds is not None
            else min(5.0, lease_timeout_seconds / 4)
        )
        if (
            self._heartbeat_interval_seconds
            + self._heartbeat_request_timeout_seconds
            + self._lease_safety_margin_seconds
            >= self._lease_timeout_seconds
        ):
            raise ValueError(
                "heartbeat interval, request timeout, and safety margin must fit "
                "inside the lease timeout"
            )
        self._shutdown_grace_seconds = shutdown_grace_seconds
        self._stale_reap_interval_seconds = stale_reap_interval_seconds
        self._reaper = stale_job_reaper
        self._retry_policy = retry_policy or RetryPolicy()
        self._sleeper = sleeper
        self._logger = logger or logging.getLogger(__name__)
        self._stop_event = asyncio.Event()
        self._next_reap_at = 0.0

    async def run(self) -> None:
        self._log(logging.INFO, "worker_started")
        while not self._stop_event.is_set():
            try:
                await self._reap_if_due()
                processed = await self.run_once()
                self._retry_policy.reset()
                if not processed and not self._stop_event.is_set():
                    await self._sleep_or_stop(self._poll_interval_seconds)
            except StructuredError as error:
                if not error.retryable:
                    self._log(
                        logging.ERROR,
                        "worker_repository_error",
                        error_code=error.code.value,
                        retryable=False,
                    )
                    raise
                delay = self._retry_policy.next_delay()
                self._log(
                    logging.WARNING,
                    "worker_repository_error",
                    error_code=error.code.value,
                    retryable=error.retryable,
                    retry_delay_seconds=delay,
                )
                await self._sleep_or_stop(delay)
        self._log(logging.INFO, "worker_stopped")

    async def run_once(self) -> bool:
        if self._stop_event.is_set():
            return False
        claim = await self._repository.claim(self._worker_id)
        if claim is None:
            return False
        self._log(
            logging.INFO,
            "job_claimed",
            job_id=str(claim.job.job_id),
            attempt_count=claim.lease.attempt_count,
        )
        await self._execute_claim(claim)
        return True

    def request_stop(self) -> None:
        self._stop_event.set()

    def handle_signal(self, received_signal: signal.Signals) -> None:
        self._log(logging.INFO, "worker_stop_requested", signal=received_signal.name)
        self.request_stop()

    async def _execute_claim(self, claim: JobClaim) -> None:
        handler_task = asyncio.create_task(self._call_handler(claim))
        heartbeat_task = asyncio.create_task(self._heartbeat_loop(claim))
        stop_task = asyncio.create_task(self._stop_event.wait())
        try:
            done, _ = await asyncio.wait(
                {handler_task, heartbeat_task, stop_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if handler_task in done:
                await self._persist_result(claim, handler_task.result())
                return
            if heartbeat_task in done:
                error = heartbeat_task.exception()
                if isinstance(error, StructuredError):
                    self._log(
                        logging.ERROR,
                        "job_lease_lost",
                        job_id=str(claim.job.job_id),
                        error_code=error.code.value,
                    )
                else:
                    self._log(
                        logging.ERROR,
                        "job_heartbeat_stopped",
                        job_id=str(claim.job.job_id),
                        error_code=ErrorCode.JOB_HEARTBEAT_TIMEOUT.value,
                    )
                await _cancel_task(handler_task)
                return

            result = await self._finish_during_shutdown(handler_task)
            if result is None:
                await self._repository.release(
                    claim.lease,
                    StructuredError(
                        code=ErrorCode.WORKER_SHUTDOWN,
                        summary="Worker stopped before the Handler completed.",
                        retryable=True,
                    ),
                )
                self._log(
                    logging.INFO,
                    "job_released_for_shutdown",
                    job_id=str(claim.job.job_id),
                )
                return
            await self._persist_result(claim, result)
        finally:
            await _cancel_task(heartbeat_task)
            await _cancel_task(stop_task)
            await _cancel_task(handler_task)

    async def _call_handler(self, claim: JobClaim) -> JobExecutionResult:
        try:
            return await self._handler.handle(claim)
        except asyncio.CancelledError:
            raise
        except StructuredError as error:
            return JobExecutionResult.failed(error)
        except Exception:
            self._logger.exception(
                "job_handler_exception",
                extra={
                    "event": "job_handler_exception",
                    "worker_id": self._worker_id,
                    "job_id": str(claim.job.job_id),
                    "error_code": ErrorCode.HANDLER_FAILED.value,
                },
            )
            return JobExecutionResult.failed(
                StructuredError(
                    code=ErrorCode.HANDLER_FAILED,
                    summary="Breeding job Handler raised an unexpected exception.",
                    retryable=True,
                )
            )

    async def _heartbeat_loop(self, claim: JobClaim) -> None:
        last_success = time.monotonic()
        safe_window_seconds = self._lease_timeout_seconds - self._lease_safety_margin_seconds
        next_attempt_at = last_success + self._heartbeat_interval_seconds
        while True:
            safe_deadline = last_success + safe_window_seconds
            now = time.monotonic()
            if now >= safe_deadline:
                raise _heartbeat_timeout()
            await asyncio.sleep(max(0.0, min(next_attempt_at, safe_deadline) - now))
            remaining_seconds = safe_deadline - time.monotonic()
            if remaining_seconds <= 0:
                raise _heartbeat_timeout()
            try:
                await asyncio.wait_for(
                    self._repository.heartbeat(claim.lease),
                    timeout=min(
                        self._heartbeat_request_timeout_seconds,
                        remaining_seconds,
                    ),
                )
            except TimeoutError as error:
                if time.monotonic() >= safe_deadline:
                    raise _heartbeat_timeout() from error
                self._log(
                    logging.WARNING,
                    "job_heartbeat_retry",
                    job_id=str(claim.job.job_id),
                    error_code=ErrorCode.JOB_HEARTBEAT_TIMEOUT.value,
                )
                next_attempt_at = min(
                    time.monotonic() + min(1.0, self._heartbeat_interval_seconds),
                    safe_deadline,
                )
            except StructuredError as error:
                if not error.retryable:
                    raise
                if time.monotonic() >= safe_deadline:
                    raise _heartbeat_timeout() from error
                self._log(
                    logging.WARNING,
                    "job_heartbeat_retry",
                    job_id=str(claim.job.job_id),
                    error_code=error.code.value,
                )
                next_attempt_at = min(
                    time.monotonic() + min(1.0, self._heartbeat_interval_seconds),
                    safe_deadline,
                )
            else:
                last_success = time.monotonic()
                next_attempt_at = last_success + self._heartbeat_interval_seconds
                self._log(
                    logging.DEBUG,
                    "job_heartbeat_succeeded",
                    job_id=str(claim.job.job_id),
                )

    async def _finish_during_shutdown(
        self,
        handler_task: asyncio.Task[JobExecutionResult],
    ) -> JobExecutionResult | None:
        try:
            return await asyncio.wait_for(
                asyncio.shield(handler_task),
                timeout=self._shutdown_grace_seconds,
            )
        except TimeoutError:
            await _cancel_task(handler_task)
            return None

    async def _persist_result(self, claim: JobClaim, result: JobExecutionResult) -> None:
        if result.outcome is JobOutcome.SUCCEEDED:
            await self._repository.complete(claim.lease)
            self._log(logging.INFO, "job_completed", job_id=str(claim.job.job_id))
            return
        if result.error is None:
            raise StructuredError(
                code=ErrorCode.HANDLER_FAILED,
                summary="Handler returned an invalid result without an error.",
                retryable=False,
            )
        if result.outcome is JobOutcome.CANCELLED:
            await self._repository.cancel(claim.lease, result.error)
            self._log(logging.INFO, "job_cancelled", job_id=str(claim.job.job_id))
            return
        status = await self._repository.fail(claim.lease, result.error)
        self._log(
            logging.WARNING,
            "job_failed",
            job_id=str(claim.job.job_id),
            error_code=result.error.code.value,
            job_status=status.value,
        )

    async def _reap_if_due(self) -> None:
        if self._reaper is None or time.monotonic() < self._next_reap_at:
            return
        released = await self._reaper.reap()
        self._next_reap_at = time.monotonic() + self._stale_reap_interval_seconds
        if released:
            self._log(logging.WARNING, "stale_jobs_released", released_count=released)

    async def _sleep_or_stop(self, delay_seconds: float) -> None:
        async def sleep() -> None:
            await self._sleeper(delay_seconds)

        async def wait_for_stop() -> None:
            await self._stop_event.wait()

        sleep_task = asyncio.create_task(sleep())
        stop_task = asyncio.create_task(wait_for_stop())
        try:
            await asyncio.wait(
                {sleep_task, stop_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
        finally:
            await _cancel_task(sleep_task)
            await _cancel_task(stop_task)

    def _log(self, level: int, event: str, **fields: object) -> None:
        self._logger.log(
            level,
            event,
            extra={"event": event, "worker_id": self._worker_id, **fields},
        )


async def _cancel_task[TaskResult](task: asyncio.Future[TaskResult]) -> None:
    if task.done():
        with contextlib.suppress(asyncio.CancelledError):
            task.exception()
        return
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task


def _heartbeat_timeout() -> StructuredError:
    return StructuredError(
        code=ErrorCode.JOB_HEARTBEAT_TIMEOUT,
        summary="Job heartbeat could not be renewed before the lease safety deadline.",
        retryable=True,
    )
