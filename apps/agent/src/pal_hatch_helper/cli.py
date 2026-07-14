import argparse
import asyncio
import contextlib
import signal
from collections.abc import Sequence
from pathlib import Path
from uuid import UUID

import uvicorn

from pal_hatch_helper.breeding.handler import BreedingJobHandler
from pal_hatch_helper.game_catalog.artifacts import SupabaseCatalogArtifactStore
from pal_hatch_helper.game_catalog.gateway import SupabaseCatalogGateway
from pal_hatch_helper.game_catalog.importer import stage_catalog_version
from pal_hatch_helper.game_catalog.jsonl import canonical_json
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.repository import LayeredGameCatalogRepository
from pal_hatch_helper.game_catalog.validation import validate_catalog_directory
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
    catalog_parser = subparsers.add_parser("catalog", help="manage immutable game catalog versions")
    catalog_commands = catalog_parser.add_subparsers(dest="catalog_command", required=True)

    validate_parser = catalog_commands.add_parser("validate", help="validate a normalized catalog")
    validate_parser.add_argument("--input", required=True, type=Path)

    stage_parser = catalog_commands.add_parser("stage", help="stage a normalized catalog")
    stage_parser.add_argument("--input", required=True, type=Path)
    stage_parser.add_argument("--source-id", type=UUID)

    for command in ("publish", "rollback"):
        version_parser = catalog_commands.add_parser(command)
        version_parser.add_argument("--world-id", required=True, type=UUID)
        version_parser.add_argument("--version-id", required=True, type=UUID)

    warm_parser = catalog_commands.add_parser("warm-cache", help="build an exact-version cache")
    warm_parser.add_argument("--version-id", required=True, type=UUID)

    inspect_parser = catalog_commands.add_parser("inspect", help="inspect exact-version metadata")
    inspect_parser.add_argument("--version-id", required=True, type=UUID)
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
    if parsed.command == "catalog":
        try:
            return run_catalog_command(parsed, settings)
        except StructuredError as error:
            get_logger(__name__).error(
                "catalog_command_failed",
                extra={"event": "catalog_command_failed", "error_code": error.code.value},
            )
            return 2
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


def run_catalog_command(parsed: argparse.Namespace, settings: Settings) -> int:
    if parsed.catalog_command == "validate":
        report = validate_catalog_directory(parsed.input)
        print(canonical_json(report.model_dump(mode="json")))
        return 0 if report.valid else 2
    if not settings.database_configured:
        raise StructuredError(
            code=ErrorCode.GAME_DATA_CONFIGURATION_REQUIRED,
            summary="Catalog command requires explicit Supabase Service Role configuration.",
            retryable=False,
        )
    return asyncio.run(_run_remote_catalog_command(parsed, settings))


async def _run_remote_catalog_command(parsed: argparse.Namespace, settings: Settings) -> int:
    assert settings.supabase_url is not None
    assert settings.supabase_service_role_key is not None
    database = SupabaseDatabaseClient(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    artifacts = SupabaseCatalogArtifactStore(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        bucket=settings.game_catalog_bucket,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    gateway = SupabaseCatalogGateway(database)
    try:
        if parsed.catalog_command == "stage":
            version_id = await stage_catalog_version(
                parsed.input,
                source_id=parsed.source_id,
                artifact_bucket=settings.game_catalog_bucket,
                artifact_store=artifacts,
                gateway=gateway,
            )
            print(canonical_json({"status": "validated", "version_id": str(version_id)}))
            return 0
        if parsed.catalog_command == "publish":
            version_id = await gateway.publish(parsed.world_id, parsed.version_id)
            print(canonical_json({"status": "published", "version_id": str(version_id)}))
            return 0
        if parsed.catalog_command == "rollback":
            version_id = await gateway.rollback(parsed.world_id, parsed.version_id)
            print(canonical_json({"status": "rolled_back", "version_id": str(version_id)}))
            return 0
        if parsed.catalog_command == "inspect":
            metadata = await gateway.get_version(parsed.version_id)
            if metadata is None:
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_VERSION_NOT_FOUND,
                    summary="The exact requested game data version does not exist.",
                    retryable=False,
                )
            safe = metadata.model_dump(mode="json", exclude={"artifact_path", "artifact_bucket"})
            print(canonical_json(safe))
            return 0
        paths = CatalogPaths(settings.palhatch_data_dir)
        paths.ensure()
        repository = LayeredGameCatalogRepository(
            paths=paths,
            metadata_store=gateway,
            artifact_store=artifacts,
            projection_store=gateway,
            max_memory_versions=settings.game_catalog_cache_max_versions,
        )
        catalog = await repository.load_version(parsed.version_id)
        print(
            canonical_json(
                {
                    "content_hash": catalog.content_hash,
                    "status": "cache_warm",
                    "version_id": str(parsed.version_id),
                }
            )
        )
        return 0
    finally:
        await artifacts.close()
        await database.close()


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
