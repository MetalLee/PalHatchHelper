from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import uuid4

import pytest

from pal_hatch_helper.commands.actions import CatalogWarmer, DefaultCommandActions
from pal_hatch_helper.commands.models import AgentCommand
from pal_hatch_helper.commands.repository import CommandRepository
from pal_hatch_helper.commands.worker import CommandDispatcher, CommandWorker
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue
from pal_hatch_helper.save_sync.registry import SnapshotRegistry
from pal_hatch_helper.save_sync.service import InventorySyncResult, InventorySyncService


class RecordingActions:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def execute(self, command: AgentCommand) -> dict[str, object]:
        self.calls.append(command.command_type)
        return {"status": "ok"}


def command(command_type: str, payload: dict[str, object] | None = None) -> AgentCommand:
    return AgentCommand(
        command_id=uuid4(),
        command_type=command_type,
        payload=payload or {},
        idempotency_key=f"phase8-{command_type}-{uuid4()}",
        created_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )


def test_unknown_command_is_rejected_without_executing_an_action() -> None:
    actions = RecordingActions()
    dispatcher = CommandDispatcher(actions)
    unknown = command("arbitrary_shell")

    with pytest.raises(StructuredError) as raised:
        asyncio.run(dispatcher.dispatch(unknown))

    assert raised.value.code is ErrorCode.AGENT_COMMAND_NOT_ALLOWED
    assert actions.calls == []


class StubDatabase:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, JSONValue]]] = []

    async def rpc(self, function_name: str, parameters: dict[str, JSONValue]) -> JSONValue:
        self.calls.append((function_name, parameters))
        return {"action": "retry_breeding_job", "job_id": str(uuid4())}

    async def close(self) -> None:
        return None


class StubSync:
    def __init__(self) -> None:
        self.sync_calls = 0
        self.reparse_calls: list[tuple[object, bool]] = []

    async def sync_once(self) -> InventorySyncResult:
        self.sync_calls += 1
        return InventorySyncResult("published", "a" * 64, uuid4(), None)

    async def reparse_snapshot(
        self, snapshot_id: object, *, approve_inventory_drop: bool = False
    ) -> InventorySyncResult:
        self.reparse_calls.append((snapshot_id, approve_inventory_drop))
        return InventorySyncResult("published", "b" * 64, uuid4(), None)


class StubRegistry:
    def __init__(self) -> None:
        self.cleanup_calls = 0

    def enforce_retention(self) -> tuple[object, ...]:
        self.cleanup_calls += 1
        return (object(), object())


class StubWarmer:
    def __init__(self) -> None:
        self.version_ids: list[object] = []

    async def load_version(self, version_id: object) -> object:
        self.version_ids.append(version_id)
        return object()


def actions() -> tuple[DefaultCommandActions, StubDatabase, StubSync, StubRegistry, StubWarmer]:
    database = StubDatabase()
    sync = StubSync()
    registry = StubRegistry()
    warmer = StubWarmer()
    action_adapter = DefaultCommandActions(
        cast(DatabaseClient, database),
        inventory_sync=cast(InventorySyncService, sync),
        snapshot_registry=cast(SnapshotRegistry, registry),
        catalog_warmer=cast(CatalogWarmer, warmer),
    )
    return action_adapter, database, sync, registry, warmer


def test_sync_reparse_approval_and_cleanup_use_only_injected_safe_adapters() -> None:
    adapter, _, sync, registry, _ = actions()
    snapshot_id = uuid4()

    sync_result = asyncio.run(adapter.execute(command("sync_save_once")))
    reparse_result = asyncio.run(
        adapter.execute(command("reparse_snapshot", {"snapshot_id": str(snapshot_id)}))
    )
    approve_result = asyncio.run(
        adapter.execute(command("approve_inventory_snapshot", {"snapshot_id": str(snapshot_id)}))
    )
    cleanup_result = asyncio.run(adapter.execute(command("cleanup_expired_agent_snapshots")))

    assert sync_result["outcome"] == "published"
    assert reparse_result["outcome"] == "published"
    assert approve_result["outcome"] == "approved"
    assert sync.sync_calls == 1
    assert sync.reparse_calls == [(snapshot_id, False), (snapshot_id, True)]
    assert cleanup_result == {"outcome": "cleaned", "removed_count": 2}
    assert registry.cleanup_calls == 1


def test_job_retry_uses_the_single_database_action_rpc() -> None:
    adapter, database, _, _, _ = actions()
    retry = command("retry_breeding_job", {"job_id": str(uuid4())})

    result = asyncio.run(adapter.execute(retry))

    assert result["action"] == "retry_breeding_job"
    assert database.calls == [
        (
            "execute_agent_command_database_action",
            {"p_command_id": str(retry.command_id)},
        )
    ]


def test_warm_cache_accepts_only_a_version_uuid() -> None:
    adapter, _, _, _, warmer = actions()
    version_id = uuid4()

    result = asyncio.run(
        adapter.execute(command("warm_catalog_cache", {"version_id": str(version_id)}))
    )

    assert result == {"outcome": "cache_warm", "version_id": str(version_id)}
    assert warmer.version_ids == [version_id]


class FakeCommandRepository:
    def __init__(self, commands: list[AgentCommand]) -> None:
        self.commands = list(commands)
        self.completed: list[object] = []
        self.failed: list[tuple[object, ErrorCode, bool]] = []
        self.heartbeat_count = 0

    async def claim(self, worker_id: str, stale_before: datetime) -> AgentCommand | None:
        del worker_id, stale_before
        return self.commands.pop(0) if self.commands else None

    async def complete(self, claimed: AgentCommand, worker_id: str, safe_summary: object) -> None:
        del worker_id, safe_summary
        self.completed.append(claimed.command_id)

    async def fail(
        self,
        claimed: AgentCommand,
        worker_id: str,
        error: StructuredError,
        *,
        rejected: bool,
    ) -> None:
        del worker_id
        self.failed.append((claimed.command_id, error.code, rejected))

    async def heartbeat(self, worker_id: str, deployment_version: str) -> None:
        del worker_id, deployment_version
        self.heartbeat_count += 1


def test_worker_claims_and_completes_each_command_once() -> None:
    claimed = command("template_ai_healthcheck")
    repository = FakeCommandRepository([claimed])
    worker = CommandWorker(
        cast(CommandRepository, repository),
        CommandDispatcher(RecordingActions()),
        worker_id="fixture-command-worker",
        deployment_version="fixture-sha",
    )

    assert asyncio.run(worker.run_once()) is True
    assert asyncio.run(worker.run_once()) is False
    assert repository.completed == [claimed.command_id]
    assert repository.heartbeat_count == 2


def test_worker_rejects_an_expired_claim_without_dispatch() -> None:
    expired = command("sync_save_once").model_copy(
        update={"expires_at": datetime.now(UTC) - timedelta(seconds=1)}
    )
    repository = FakeCommandRepository([expired])
    actions = RecordingActions()
    worker = CommandWorker(
        cast(CommandRepository, repository),
        CommandDispatcher(actions),
        worker_id="fixture-command-worker",
        deployment_version="fixture-sha",
    )

    assert asyncio.run(worker.run_once()) is True
    assert repository.failed == [(expired.command_id, ErrorCode.AGENT_COMMAND_EXPIRED, True)]
    assert actions.calls == []


def test_worker_restart_can_process_a_recovered_claim_idempotently() -> None:
    recovered = command("template_ai_healthcheck")
    repository = FakeCommandRepository([])
    first_worker = CommandWorker(
        cast(CommandRepository, repository),
        CommandDispatcher(RecordingActions()),
        worker_id="worker-before-restart",
        deployment_version="fixture-sha",
    )
    assert asyncio.run(first_worker.run_once()) is False

    repository.commands.append(recovered)
    second_worker = CommandWorker(
        cast(CommandRepository, repository),
        CommandDispatcher(RecordingActions()),
        worker_id="worker-after-restart",
        deployment_version="fixture-sha",
    )
    assert asyncio.run(second_worker.run_once()) is True
    assert repository.completed == [recovered.command_id]
