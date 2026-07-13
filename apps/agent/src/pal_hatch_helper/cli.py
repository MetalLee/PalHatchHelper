import argparse
import asyncio
import contextlib
import signal
from collections.abc import Sequence

import uvicorn

from pal_hatch_helper.breeding.handler import BreedingJobHandler
from pal_hatch_helper.main import create_app
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.observability.logging import configure_logging, get_logger
from pal_hatch_helper.repositories.database import SupabaseDatabaseClient
from pal_hatch_helper.repositories.jobs import SupabaseJobRepository
from pal_hatch_helper.settings import Settings
from pal_hatch_helper.workers.job_worker import JobWorker
from pal_hatch_helper.workers.reaper import StaleJobReaper


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pal-hatch-helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    api_parser = subparsers.add_parser("api", help="run the private health API")
    api_parser.add_argument(
        "--host",
        choices=("127.0.0.1", "0.0.0.0"),
        default="127.0.0.1",
        help="0.0.0.0 is only safe inside the container mapped to host loopback",
    )
    api_parser.add_argument("--port", default=18765, type=int)

    subparsers.add_parser("job-worker", help="run outbound breeding job polling")
    subparsers.add_parser("save-worker", help="reserved Phase 3 save worker boundary")
    return parser


def main(arguments: Sequence[str] | None = None) -> int:
    parsed = build_parser().parse_args(arguments)
    configure_logging()
    settings = Settings()
    if parsed.command == "api":
        uvicorn.run(
            create_app(settings),
            host=str(parsed.host),
            port=int(parsed.port),
            access_log=False,
        )
        return 0
    if parsed.command == "save-worker":
        get_logger(__name__).error(
            "save_worker_not_implemented",
            extra={
                "event": "save_worker_not_implemented",
                "error_code": ErrorCode.SAVE_WORKER_NOT_IMPLEMENTED.value,
            },
        )
        return 2

    try:
        asyncio.run(run_job_worker(settings))
    except StructuredError as error:
        get_logger(__name__).error(
            "job_worker_start_failed",
            extra={
                "event": "job_worker_start_failed",
                "error_code": error.code.value,
            },
        )
        return 2
    return 0


async def run_job_worker(
    settings: Settings,
    handler: BreedingJobHandler | None = None,
) -> None:
    if not settings.database_configured:
        raise StructuredError(
            code=ErrorCode.DATABASE_UNAVAILABLE,
            summary="Job Worker database configuration is incomplete.",
            retryable=False,
        )
    if handler is None:
        raise StructuredError(
            code=ErrorCode.BREEDING_HANDLER_NOT_CONFIGURED,
            summary="A BreedingJobHandler is required before jobs may be claimed.",
            retryable=False,
        )
    assert settings.supabase_url is not None
    assert settings.supabase_service_role_key is not None
    database = SupabaseDatabaseClient(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    repository = SupabaseJobRepository(database)
    reaper = StaleJobReaper(
        repository=repository,
        lease_timeout_seconds=settings.job_lease_timeout_seconds,
    )
    worker = JobWorker(
        repository,
        handler,
        worker_id=settings.worker_id,
        poll_interval_seconds=settings.job_poll_interval_seconds,
        heartbeat_interval_seconds=settings.job_heartbeat_interval_seconds,
        heartbeat_request_timeout_seconds=settings.database_request_timeout_seconds,
        lease_timeout_seconds=settings.job_lease_timeout_seconds,
        lease_safety_margin_seconds=settings.job_lease_safety_margin_seconds,
        shutdown_grace_seconds=settings.job_shutdown_grace_seconds,
        stale_reap_interval_seconds=settings.job_stale_reap_interval_seconds,
        stale_job_reaper=reaper,
        logger=get_logger("pal_hatch_helper.job_worker"),
    )
    loop = asyncio.get_running_loop()
    for handled_signal in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError, RuntimeError):
            loop.add_signal_handler(handled_signal, worker.handle_signal, handled_signal)
    try:
        await worker.run()
    finally:
        await database.close()
