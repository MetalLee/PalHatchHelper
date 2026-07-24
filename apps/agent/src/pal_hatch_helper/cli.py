import argparse
import asyncio
import contextlib
import shutil
import signal
import time
from collections.abc import Sequence
from pathlib import Path, PurePosixPath
from uuid import UUID

import uvicorn

from pal_hatch_helper.ai.providers import (
    AIProvider,
    CodexCliProvider,
    ConcurrencyLimitedAIProvider,
    FallbackAIProvider,
    OpenAICompatibleProvider,
    TemplateProvider,
)
from pal_hatch_helper.breeding.adapter import BreedingEngineAdapter
from pal_hatch_helper.breeding.data_sources import (
    BreedingDataSourceAdapter,
    RegisteredRemoteDataSourceAdapter,
    RegisteredRemoteSourceConfig,
    UploadDataSourceAdapter,
    UploadSourceConfig,
    source_fetch_policy_from_settings,
    stage_breeding_source,
)
from pal_hatch_helper.breeding.handler import BreedingJobHandler
from pal_hatch_helper.breeding.phase6_handler import Phase6BreedingJobHandler
from pal_hatch_helper.breeding.supply_chain import prepare_breeding_catalog_version
from pal_hatch_helper.commands.actions import DefaultCommandActions
from pal_hatch_helper.commands.catalog_operations import (
    CatalogAdminOperationWorker,
    SupabaseCatalogOperationRepository,
)
from pal_hatch_helper.commands.repository import SupabaseCommandRepository
from pal_hatch_helper.commands.worker import CommandDispatcher, CommandWorker
from pal_hatch_helper.game_catalog.artifacts import SupabaseCatalogArtifactStore
from pal_hatch_helper.game_catalog.gateway import SupabaseCatalogGateway
from pal_hatch_helper.game_catalog.importer import stage_catalog_version
from pal_hatch_helper.game_catalog.jsonl import canonical_json
from pal_hatch_helper.game_catalog.paths import CatalogPaths
from pal_hatch_helper.game_catalog.repository import LayeredGameCatalogRepository
from pal_hatch_helper.game_catalog.validation import validate_catalog_directory
from pal_hatch_helper.generated import RuntimeSettings
from pal_hatch_helper.main import create_app
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.validator import CanonicalSnapshotValidator
from pal_hatch_helper.observability.logging import configure_logging, get_logger
from pal_hatch_helper.parsers.subprocess import SubprocessParserAdapter
from pal_hatch_helper.plans.processor import CandidateDetectionProcessor
from pal_hatch_helper.repositories.breeding import SupabaseBreedingRuntimeRepository
from pal_hatch_helper.repositories.breeding_results import SupabaseBreedingResultRepository
from pal_hatch_helper.repositories.database import JSONValue, SupabaseDatabaseClient
from pal_hatch_helper.repositories.execution_plans import SupabaseExecutionPlanRepository
from pal_hatch_helper.repositories.inventory import SupabaseInventoryRepository
from pal_hatch_helper.repositories.jobs import SupabaseJobRepository
from pal_hatch_helper.runtime_settings import load_agent_runtime_settings
from pal_hatch_helper.save_sync.registry import SnapshotRegistry
from pal_hatch_helper.save_sync.service import InventorySyncService
from pal_hatch_helper.save_sync.snapshot import SnapshotCopier
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

    job_worker_parser = subparsers.add_parser(
        "job-worker", help="run outbound breeding job polling"
    )
    job_worker_parser.add_argument(
        "--once",
        action="store_true",
        help="reap stale leases and process at most one job before exiting",
    )
    subparsers.add_parser("save-worker", help="run read-only save snapshot synchronization")
    command_worker_parser = subparsers.add_parser(
        "command-worker", help="poll and execute allowlisted administrator commands"
    )
    command_worker_parser.add_argument(
        "--once", action="store_true", help="process at most one command before exiting"
    )
    candidate_parser = subparsers.add_parser(
        "candidate-detector",
        help="idempotently process one already-published normalized snapshot",
    )
    candidate_parser.add_argument("--snapshot-id", required=True, type=UUID)
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
    diff_parser = catalog_commands.add_parser(
        "diff",
        help="compare two validated breeding versions",
    )
    diff_parser.add_argument("--from-version-id", required=True, type=UUID)
    diff_parser.add_argument("--to-version-id", required=True, type=UUID)
    prepare_breeding_parser = catalog_commands.add_parser(
        "prepare-breeding-source",
        help="fetch an audited source and build a local immutable candidate",
    )
    prepare_breeding_parser.add_argument("--source-id", required=True, type=UUID)
    prepare_breeding_parser.add_argument("--source-version", required=True)
    prepare_breeding_parser.add_argument("--base-version-id", required=True, type=UUID)
    prepare_breeding_parser.add_argument("--upload-file", type=Path)
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
        try:
            asyncio.run(run_save_worker(settings))
        except StructuredError as error:
            get_logger(__name__).error(
                "save_worker_start_failed",
                extra={
                    "event": "save_worker_start_failed",
                    "error_code": error.code.value,
                },
            )
            return 2
        return 0
    if parsed.command == "candidate-detector":
        try:
            asyncio.run(run_candidate_detector(settings, parsed.snapshot_id))
        except StructuredError as error:
            get_logger(__name__).error(
                "candidate_detector_failed",
                extra={
                    "event": "candidate_detector_failed",
                    "error_code": error.code.value,
                },
            )
            return 2
        return 0
    if parsed.command == "command-worker":
        try:
            asyncio.run(run_command_worker(settings, run_once=bool(parsed.once)))
        except StructuredError as error:
            get_logger(__name__).error(
                "command_worker_start_failed",
                extra={
                    "event": "command_worker_start_failed",
                    "error_code": error.code.value,
                },
            )
            return 2
        return 0

    try:
        asyncio.run(run_job_worker(settings, run_once=bool(parsed.once)))
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
        if parsed.catalog_command == "diff":
            report = await gateway.breeding_diff(
                parsed.from_version_id,
                parsed.to_version_id,
            )
            print(canonical_json(report.model_dump(mode="json")))
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
        if parsed.catalog_command == "prepare-breeding-source":
            source = await gateway.get_source(parsed.source_id)
            if source is None or not source.enabled:
                raise StructuredError(
                    code=ErrorCode.BREEDING_SOURCE_DISABLED,
                    summary="The exact registered breeding source is unavailable or disabled.",
                    retryable=False,
                )
            base_metadata = await gateway.get_version(parsed.base_version_id)
            if base_metadata is None or base_metadata.status != "published":
                raise StructuredError(
                    code=ErrorCode.GAME_DATA_VERSION_NOT_PUBLISHED,
                    summary="The exact breeding base catalog is not published.",
                    retryable=False,
                )
            base_catalog = await repository.load_version(parsed.base_version_id)
            adapter: BreedingDataSourceAdapter
            if source.source_type == "upload":
                if parsed.upload_file is None or not parsed.upload_file.is_file():
                    raise StructuredError(
                        code=ErrorCode.BREEDING_SOURCE_INVALID,
                        summary="The registered upload source requires an explicit readable file.",
                        retryable=False,
                    )
                adapter = UploadDataSourceAdapter(
                    UploadSourceConfig(
                        name=source.name,
                        filename=parsed.upload_file.name,
                        source_version=parsed.source_version,
                        enabled=source.enabled,
                    ),
                    parsed.upload_file.read_bytes(),
                    policy=source_fetch_policy_from_settings(settings),
                )
            elif (
                source.source_type == "github" or source.source_type == "url"
            ) and source.source_url is not None:
                adapter = RegisteredRemoteDataSourceAdapter(
                    RegisteredRemoteSourceConfig(
                        source_type=source.source_type,
                        name=source.name,
                        url=source.source_url,
                        source_version=parsed.source_version,
                        enabled=source.enabled,
                    ),
                    policy=source_fetch_policy_from_settings(settings),
                )
            else:
                raise StructuredError(
                    code=ErrorCode.BREEDING_SOURCE_INVALID,
                    summary="The registered breeding source configuration is unsupported.",
                    retryable=False,
                )
            staged = await stage_breeding_source(
                adapter,
                paths=paths,
                source_id=source.id,
            )
            prepared = prepare_breeding_catalog_version(
                staged,
                base_catalog=base_catalog,
                paths=paths,
            )
            candidate = validate_catalog_directory(prepared.normalized_directory)
            print(
                canonical_json(
                    {
                        "base_version_id": str(parsed.base_version_id),
                        "content_hash": candidate.content_hash,
                        "source_id": str(source.id),
                        "status": "candidate_ready",
                    }
                )
            )
            return 0
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
    *,
    run_once: bool = False,
) -> None:
    if not settings.database_configured:
        raise StructuredError(
            code=ErrorCode.DATABASE_UNAVAILABLE,
            summary="Job Worker database configuration is incomplete.",
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
    runtime_state = await load_agent_runtime_settings(database)
    runtime_settings = runtime_state.settings
    artifacts: SupabaseCatalogArtifactStore | None = None
    external_provider: OpenAICompatibleProvider | None = None
    if handler is None:
        artifacts = SupabaseCatalogArtifactStore(
            base_url=settings.supabase_url,
            service_role_key=settings.supabase_service_role_key,
            bucket=settings.game_catalog_bucket,
            request_timeout_seconds=settings.database_request_timeout_seconds,
        )
        gateway = SupabaseCatalogGateway(database)
        paths = CatalogPaths(settings.palhatch_data_dir)
        paths.ensure()
        catalog_repository = LayeredGameCatalogRepository(
            paths=paths,
            metadata_store=gateway,
            artifact_store=artifacts,
            projection_store=gateway,
            max_memory_versions=settings.game_catalog_cache_max_versions,
        )
        runtime_repository = SupabaseBreedingRuntimeRepository(
            database,
            catalog_gateway=gateway,
            catalog_repository=catalog_repository,
        )
        algorithm = BreedingEngineAdapter(runtime_repository)
        await algorithm.initialize()
        ai_provider, external_provider = _build_ai_provider(settings, runtime_settings)
        handler = Phase6BreedingJobHandler(
            algorithm,
            SupabaseBreedingResultRepository(database),
            ai_provider,
        )
    reaper = StaleJobReaper(
        repository=repository,
        lease_timeout_seconds=settings.job_lease_timeout_seconds,
    )
    workers = [
        JobWorker(
            repository,
            handler,
            worker_id=(
                settings.worker_id
                if runtime_settings.job_worker_concurrency == 1
                else f"{settings.worker_id}-{index + 1}"
            ),
            poll_interval_seconds=settings.job_poll_interval_seconds,
            heartbeat_interval_seconds=settings.job_heartbeat_interval_seconds,
            heartbeat_request_timeout_seconds=settings.database_request_timeout_seconds,
            lease_timeout_seconds=settings.job_lease_timeout_seconds,
            lease_safety_margin_seconds=settings.job_lease_safety_margin_seconds,
            shutdown_grace_seconds=settings.job_shutdown_grace_seconds,
            stale_reap_interval_seconds=settings.job_stale_reap_interval_seconds,
            stale_job_reaper=reaper if index == 0 else None,
            logger=get_logger("pal_hatch_helper.job_worker"),
        )
        for index in range(runtime_settings.job_worker_concurrency)
    ]
    loop = asyncio.get_running_loop()
    for handled_signal in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError, RuntimeError):
            loop.add_signal_handler(
                handled_signal,
                _stop_job_workers,
                workers,
                handled_signal,
            )
    try:
        heartbeat_task = asyncio.create_task(
            _worker_heartbeat_loop(
                database,
                settings,
                "job_worker",
                {
                    "runtime_settings_version": runtime_state.version,
                    "worker_concurrency": runtime_settings.job_worker_concurrency,
                    "ai_concurrency": runtime_settings.ai_concurrency,
                },
            )
        )
        if run_once:
            await reaper.reap()
            await workers[0].run_once()
        else:
            async with asyncio.TaskGroup() as task_group:
                for worker in workers:
                    task_group.create_task(worker.run())
    finally:
        await _cancel_background(heartbeat_task)
        if external_provider is not None:
            await external_provider.close()
        if artifacts is not None:
            await artifacts.close()
        await database.close()


async def run_candidate_detector(settings: Settings, snapshot_id: UUID) -> None:
    if not settings.database_configured:
        raise StructuredError(
            code=ErrorCode.DATABASE_UNAVAILABLE,
            summary="Candidate detector database configuration is incomplete.",
            retryable=False,
        )
    assert settings.supabase_url is not None
    assert settings.supabase_service_role_key is not None
    database = SupabaseDatabaseClient(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    try:
        await _record_worker_heartbeat(database, settings, "candidate_detector")
        await CandidateDetectionProcessor(
            SupabaseExecutionPlanRepository(database)
        ).process_snapshot(snapshot_id)
        await _record_worker_heartbeat(database, settings, "candidate_detector")
    finally:
        await database.close()


async def run_command_worker(settings: Settings, *, run_once: bool = False) -> None:
    if not settings.database_configured:
        raise StructuredError(
            code=ErrorCode.DATABASE_UNAVAILABLE,
            summary="Command Worker database configuration is incomplete.",
            retryable=False,
        )
    assert settings.supabase_url is not None
    assert settings.supabase_service_role_key is not None
    database = SupabaseDatabaseClient(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    runtime_state = await load_agent_runtime_settings(database)
    artifacts = SupabaseCatalogArtifactStore(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        bucket=settings.game_catalog_bucket,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    paths = CatalogPaths(settings.palhatch_data_dir)
    paths.ensure()
    catalog_gateway = SupabaseCatalogGateway(database)
    catalog_repository = LayeredGameCatalogRepository(
        paths=paths,
        metadata_store=catalog_gateway,
        artifact_store=artifacts,
        projection_store=catalog_gateway,
        max_memory_versions=settings.game_catalog_cache_max_versions,
    )
    inventory_sync: InventorySyncService | None = None
    registry: SnapshotRegistry | None = None
    if settings.save_worker_configured:
        inventory_sync = await _build_inventory_sync_service(
            settings, database, runtime_state.settings
        )
        registry = SnapshotRegistry(
            settings.palhatch_data_dir / "snapshots",
            successful_count=runtime_state.settings.snapshot_retention_count,
        )
    worker = CommandWorker(
        SupabaseCommandRepository(database),
        CommandDispatcher(
            DefaultCommandActions(
                database,
                inventory_sync=inventory_sync,
                snapshot_registry=registry,
                catalog_warmer=catalog_repository,
            )
        ),
        worker_id=settings.worker_id,
        deployment_version=settings.app_version,
        poll_interval_seconds=settings.command_poll_interval_seconds,
        stale_after_seconds=settings.command_stale_after_seconds,
        logger=get_logger("pal_hatch_helper.command_worker"),
    )
    catalog_operation_worker = CatalogAdminOperationWorker(
        SupabaseCatalogOperationRepository(database),
        artifact_store=artifacts,
        gateway=catalog_gateway,
        paths=paths,
        artifact_bucket=settings.game_catalog_bucket,
        worker_id=settings.worker_id,
        stale_after_seconds=settings.command_stale_after_seconds,
    )
    loop = asyncio.get_running_loop()
    for handled_signal in (signal.SIGTERM, signal.SIGINT):
        with contextlib.suppress(NotImplementedError, RuntimeError):
            loop.add_signal_handler(handled_signal, worker.request_stop)
    try:
        heartbeat_task = asyncio.create_task(
            _worker_heartbeat_loop(database, settings, "command_worker")
        )
        if run_once:
            processed = await worker.run_once()
            if not processed:
                await catalog_operation_worker.run_once()
        else:
            while not worker.stopped:
                processed = await worker.run_once()
                if not processed:
                    processed = await catalog_operation_worker.run_once()
                if not processed:
                    await asyncio.sleep(settings.command_poll_interval_seconds)
    finally:
        await _cancel_background(heartbeat_task)
        await artifacts.close()
        await database.close()


def _build_ai_provider(
    settings: Settings,
    runtime_settings: RuntimeSettings | None = None,
) -> tuple[AIProvider, OpenAICompatibleProvider | None]:
    runtime = runtime_settings or _default_runtime_settings()
    available: dict[str, AIProvider] = {"template": TemplateProvider()}
    external: OpenAICompatibleProvider | None = None
    if (
        settings.ai_openai_compatible_base_url is not None
        and settings.ai_openai_compatible_api_key is not None
        and settings.ai_openai_compatible_model is not None
    ):
        external = OpenAICompatibleProvider(
            base_url=settings.ai_openai_compatible_base_url,
            api_key=settings.ai_openai_compatible_api_key,
            model=settings.ai_openai_compatible_model,
            timeout_seconds=settings.ai_provider_timeout_seconds,
            maximum_response_bytes=settings.ai_maximum_response_bytes,
        )
        available["openai_compatible"] = external
    if settings.ai_codex_cli_enabled:
        available["codex_cli"] = CodexCliProvider(
            timeout_seconds=settings.ai_provider_timeout_seconds,
            maximum_response_bytes=settings.ai_maximum_response_bytes,
        )
    providers = [
        available[name.value] for name in runtime.ai_provider_order if name.value in available
    ]
    if not any(isinstance(provider, TemplateProvider) for provider in providers):
        providers.append(available["template"])
    return (
        ConcurrencyLimitedAIProvider(FallbackAIProvider(tuple(providers)), runtime.ai_concurrency),
        external,
    )


async def run_save_worker(
    settings: Settings,
    *,
    stop_event: asyncio.Event | None = None,
) -> None:
    if not settings.save_worker_configured:
        raise StructuredError(
            code=ErrorCode.SAVE_WORKER_CONFIGURATION_REQUIRED,
            summary=(
                "Save Worker requires an explicitly confirmed path, parser, world, and database."
            ),
            retryable=False,
        )
    assert settings.supabase_url is not None
    assert settings.supabase_service_role_key is not None
    database = SupabaseDatabaseClient(
        base_url=settings.supabase_url,
        service_role_key=settings.supabase_service_role_key,
        request_timeout_seconds=settings.database_request_timeout_seconds,
    )
    try:
        runtime_state = await load_agent_runtime_settings(database)
        service = await _build_inventory_sync_service(settings, database, runtime_state.settings)
        stopped = stop_event or asyncio.Event()
        loop = asyncio.get_running_loop()
        for handled_signal in (signal.SIGTERM, signal.SIGINT):
            with contextlib.suppress(NotImplementedError, RuntimeError):
                loop.add_signal_handler(handled_signal, stopped.set)
        logger = get_logger("pal_hatch_helper.save_worker")
        while not stopped.is_set():
            started_at = time.monotonic()
            try:
                result = await service.sync_once()
                await _record_worker_heartbeat(
                    database,
                    settings,
                    "save_worker",
                    {
                        "save_root_configured": True,
                        "read_only_mount": (
                            "verified"
                            if settings.palworld_save_mount_read_only_verified
                            else "unverified"
                        ),
                        "parse_duration_ms": max(0, int((time.monotonic() - started_at) * 1000)),
                        "runtime_settings_version": runtime_state.version,
                        "parser_timeout_seconds": runtime_state.settings.parser_timeout_seconds,
                        "snapshot_retention_count": runtime_state.settings.snapshot_retention_count,
                    },
                )
                logger.info(
                    "save_sync_completed",
                    extra={"event": "save_sync_completed", "status": result.status},
                )
            except StructuredError as error:
                await _record_worker_heartbeat(
                    database,
                    settings,
                    "save_worker",
                    {
                        "save_root_configured": True,
                        "read_only_mount": (
                            "verified"
                            if settings.palworld_save_mount_read_only_verified
                            else "unverified"
                        ),
                        "last_error_code": error.code.value,
                        "runtime_settings_version": runtime_state.version,
                        "parser_timeout_seconds": runtime_state.settings.parser_timeout_seconds,
                        "snapshot_retention_count": runtime_state.settings.snapshot_retention_count,
                    },
                )
                logger.warning(
                    "save_sync_skipped",
                    extra={
                        "event": "save_sync_skipped",
                        "error_code": error.code.value,
                    },
                )
            try:
                cleanup = await service.cleanup_expired_payloads()
                if (
                    cleanup.purged_snapshot_count
                    or cleanup.deleted_failure_count
                    or cleanup.deleted_detection_run_count
                ):
                    logger.info(
                        "inventory_retention_cleanup_completed",
                        extra={
                            "event": "inventory_retention_cleanup_completed",
                            "purged_snapshot_count": cleanup.purged_snapshot_count,
                            "deleted_item_count": cleanup.deleted_item_count,
                            "deleted_failure_count": cleanup.deleted_failure_count,
                            "deleted_detection_run_count": (cleanup.deleted_detection_run_count),
                        },
                    )
            except StructuredError as error:
                logger.warning(
                    "inventory_retention_cleanup_failed",
                    extra={
                        "event": "inventory_retention_cleanup_failed",
                        "error_code": error.code.value,
                    },
                )
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(
                    stopped.wait(),
                    timeout=settings.save_poll_interval_seconds,
                )
    finally:
        await database.close()


async def _build_inventory_sync_service(
    settings: Settings,
    database: SupabaseDatabaseClient,
    runtime_settings: RuntimeSettings | None = None,
) -> InventorySyncService:
    assert settings.palworld_compose_dir is not None
    assert settings.palworld_save_root is not None
    assert settings.palworld_world_id is not None
    assert settings.palworld_world_uid is not None
    assert settings.parser_name is not None
    assert settings.parser_version is not None
    if (
        not settings.palworld_compose_dir.is_dir()
        or not settings.palworld_save_root.is_dir()
        or settings.palworld_save_root.is_symlink()
    ):
        raise StructuredError(
            code=ErrorCode.SAVE_PATH_NOT_CONFIRMED,
            summary="The explicitly configured Compose and save directories are not available.",
            retryable=False,
        )
    repository = SupabaseInventoryRepository(database)
    catalog = await repository.catalog_ids(settings.palworld_world_id)
    runtime = runtime_settings or _default_runtime_settings()
    parser = SubprocessParserAdapter(
        name=settings.parser_name,
        version=settings.parser_version,
        command=settings.parser_command,
        declared_files=tuple(PurePosixPath(path) for path in settings.parser_required_files),
        timeout_seconds=runtime.parser_timeout_seconds,
        memory_limit_bytes=settings.parser_memory_limit_bytes,
        cpu_limit_seconds=settings.parser_cpu_limit_seconds,
        runtime_read_paths=(
            (settings.palhatch_oodle_lib,) if settings.palhatch_oodle_lib is not None else ()
        ),
        environment={
            "PALHATCH_WORLD_UID": settings.palworld_world_uid,
            **(
                {"PALHATCH_OODLE_LIB": str(settings.palhatch_oodle_lib)}
                if settings.palhatch_oodle_lib is not None
                else {}
            ),
            **(
                {"PALHATCH_OODLE_SHA256": settings.palhatch_oodle_sha256}
                if settings.palhatch_oodle_sha256 is not None
                else {}
            ),
        },
    )
    return InventorySyncService(
        world_id=settings.palworld_world_id,
        source_root=settings.palworld_save_root,
        runtime_root=settings.palhatch_data_dir / "runtime" / "parser",
        copier=SnapshotCopier(
            snapshot_root=settings.palhatch_data_dir / "snapshots",
            stability_delay_seconds=settings.save_stability_delay_seconds,
        ),
        parser=parser,
        validator=CanonicalSnapshotValidator(
            expected_world_uid=settings.palworld_world_uid,
            known_pal_ids=catalog.pal_ids,
            known_passive_skill_ids=catalog.passive_skill_ids,
        ),
        repository=repository,
        registry=SnapshotRegistry(
            settings.palhatch_data_dir / "snapshots",
            successful_count=runtime.snapshot_retention_count,
        ),
        published_snapshot_processor=CandidateDetectionProcessor(
            SupabaseExecutionPlanRepository(database)
        ),
    )


async def _record_worker_heartbeat(
    database: SupabaseDatabaseClient,
    settings: Settings,
    worker_kind: str,
    metadata: dict[str, JSONValue] | None = None,
) -> None:
    safe_metadata: dict[str, JSONValue] = dict(metadata or {})
    safe_metadata["database_configured"] = settings.database_configured
    safe_metadata["ai_provider_configured"] = bool(
        settings.ai_codex_cli_enabled
        or (
            settings.ai_openai_compatible_base_url is not None
            and settings.ai_openai_compatible_api_key is not None
            and settings.ai_openai_compatible_model is not None
        )
    )
    try:
        disk = shutil.disk_usage(settings.palhatch_data_dir)
        safe_metadata["disk_available_bytes"] = disk.free
        safe_metadata["disk_level"] = (
            "critical"
            if disk.free < 512 * 1024 * 1024
            else "warning"
            if disk.free < 2 * 1024 * 1024 * 1024
            else "normal"
        )
    except OSError:
        safe_metadata["disk_level"] = "unknown"
    for kind in ("agent", worker_kind):
        result = await database.rpc(
            "record_agent_worker_heartbeat",
            {
                "p_worker_kind": kind,
                "p_worker_id": settings.worker_id,
                "p_deployment_version": settings.app_version,
                "p_safe_metadata": safe_metadata,
            },
        )
        if result is not True:
            raise StructuredError(
                code=ErrorCode.DATABASE_RESPONSE_INVALID,
                summary="Worker heartbeat RPC returned an invalid response.",
                retryable=False,
            )


async def _worker_heartbeat_loop(
    database: SupabaseDatabaseClient,
    settings: Settings,
    worker_kind: str,
    metadata: dict[str, JSONValue] | None = None,
) -> None:
    while True:
        await _record_worker_heartbeat(database, settings, worker_kind, metadata)
        await asyncio.sleep(30)


def _stop_job_workers(workers: Sequence[JobWorker], received_signal: signal.Signals) -> None:
    for worker in workers:
        worker.handle_signal(received_signal)


def _default_runtime_settings() -> RuntimeSettings:
    return RuntimeSettings.model_validate(
        {
            "job_creation_enabled": True,
            "max_generations": 5,
            "job_worker_concurrency": 1,
            "ai_concurrency": 1,
            "parser_timeout_seconds": 180,
            "snapshot_retention_count": 3,
            "data_stale_threshold_minutes": 15,
            "ai_provider_order": ["openai_compatible", "codex_cli", "template"],
            "maintenance_announcement": None,
        }
    )


async def _cancel_background(task: asyncio.Task[None]) -> None:
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
