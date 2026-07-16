import asyncio
import contextlib
import logging
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Protocol

from pal_hatch_helper.commands.models import AgentCommand
from pal_hatch_helper.commands.repository import CommandRepository
from pal_hatch_helper.models.errors import ErrorCode, StructuredError

ALLOWED_COMMAND_TYPES = frozenset(
    {
        "sync_save_once",
        "reparse_snapshot",
        "approve_inventory_snapshot",
        "reject_inventory_snapshot",
        "cleanup_expired_agent_snapshots",
        "retry_breeding_job",
        "cancel_breeding_job",
        "reap_stale_job_lock",
        "template_ai_healthcheck",
        "warm_catalog_cache",
    }
)


class CommandActions(Protocol):
    async def execute(self, command: AgentCommand) -> Mapping[str, object]: ...


class CommandDispatcher:
    def __init__(self, actions: CommandActions) -> None:
        self._actions = actions

    async def dispatch(self, command: AgentCommand) -> Mapping[str, object]:
        if command.command_type not in ALLOWED_COMMAND_TYPES:
            raise StructuredError(
                code=ErrorCode.AGENT_COMMAND_NOT_ALLOWED,
                summary="The requested Agent command type is not allowlisted.",
                retryable=False,
            )
        return await self._actions.execute(command)


class CommandWorker:
    def __init__(
        self,
        repository: CommandRepository,
        dispatcher: CommandDispatcher,
        *,
        worker_id: str,
        deployment_version: str,
        poll_interval_seconds: float = 2,
        stale_after_seconds: float = 120,
        logger: logging.Logger | None = None,
    ) -> None:
        self._repository = repository
        self._dispatcher = dispatcher
        self._worker_id = worker_id
        self._deployment_version = deployment_version
        self._poll_interval_seconds = poll_interval_seconds
        self._stale_after = timedelta(seconds=stale_after_seconds)
        self._logger = logger or logging.getLogger(__name__)
        self._stop = asyncio.Event()

    def request_stop(self) -> None:
        self._stop.set()

    @property
    def stopped(self) -> bool:
        return self._stop.is_set()

    async def run(self) -> None:
        while not self._stop.is_set():
            processed = await self.run_once()
            if not processed:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self._stop.wait(), self._poll_interval_seconds)

    async def run_once(self) -> bool:
        now = datetime.now(UTC)
        await self._repository.heartbeat(self._worker_id, self._deployment_version)
        command = await self._repository.claim(self._worker_id, now - self._stale_after)
        if command is None:
            return False
        if command.expired(now):
            await self._repository.fail(
                command,
                self._worker_id,
                StructuredError(
                    code=ErrorCode.AGENT_COMMAND_EXPIRED,
                    summary="The Agent command expired before execution.",
                    retryable=False,
                ),
                rejected=True,
            )
            return True
        try:
            summary = await self._dispatcher.dispatch(command)
        except StructuredError as error:
            await self._repository.fail(
                command,
                self._worker_id,
                error,
                rejected=error.code is ErrorCode.AGENT_COMMAND_NOT_ALLOWED,
            )
            self._logger.warning(
                "agent_command_failed",
                extra={
                    "event": "agent_command_failed",
                    "command_id": str(command.command_id),
                    "command_type": command.command_type,
                    "error_code": error.code.value,
                },
            )
            return True
        await self._repository.complete(command, self._worker_id, summary)
        self._logger.info(
            "agent_command_completed",
            extra={
                "event": "agent_command_completed",
                "command_id": str(command.command_id),
                "command_type": command.command_type,
            },
        )
        return True
