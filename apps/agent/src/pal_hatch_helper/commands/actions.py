from typing import Protocol
from uuid import UUID

from pal_hatch_helper.commands.models import AgentCommand
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient
from pal_hatch_helper.save_sync.registry import SnapshotRegistry
from pal_hatch_helper.save_sync.service import InventorySyncService


class CatalogWarmer(Protocol):
    async def load_version(self, version_id: UUID) -> object: ...


class DefaultCommandActions:
    """Explicit adapter that never executes a process, shell, path, or Docker input."""

    def __init__(
        self,
        database: DatabaseClient,
        *,
        inventory_sync: InventorySyncService | None,
        snapshot_registry: SnapshotRegistry | None,
        catalog_warmer: CatalogWarmer,
    ) -> None:
        self._database = database
        self._inventory_sync = inventory_sync
        self._snapshot_registry = snapshot_registry
        self._catalog_warmer = catalog_warmer

    async def execute(self, command: AgentCommand) -> dict[str, object]:
        if command.command_type == "sync_save_once":
            service = self._require_inventory_sync()
            result = await service.sync_once()
            return {
                "outcome": result.status,
                "snapshot_id": str(result.snapshot_id) if result.snapshot_id else None,
            }
        if command.command_type == "reparse_snapshot":
            result = await self._require_inventory_sync().reparse_snapshot(
                _uuid_payload(command, "snapshot_id")
            )
            return {"outcome": result.status, "snapshot_id": str(result.snapshot_id)}
        if command.command_type == "approve_inventory_snapshot":
            result = await self._require_inventory_sync().reparse_snapshot(
                _uuid_payload(command, "snapshot_id"),
                approve_inventory_drop=True,
            )
            return {"outcome": "approved", "snapshot_id": str(result.snapshot_id)}
        if command.command_type == "cleanup_expired_agent_snapshots":
            if self._snapshot_registry is None:
                raise _action_unavailable()
            removed = self._snapshot_registry.enforce_retention()
            return {"outcome": "cleaned", "removed_count": len(removed)}
        if command.command_type == "template_ai_healthcheck":
            return {"outcome": "healthy", "provider": "template"}
        if command.command_type == "warm_catalog_cache":
            version_id = _uuid_payload(command, "version_id")
            await self._catalog_warmer.load_version(version_id)
            return {"outcome": "cache_warm", "version_id": str(version_id)}
        if command.command_type in {
            "reject_inventory_snapshot",
            "retry_breeding_job",
            "cancel_breeding_job",
            "reap_stale_job_lock",
        }:
            database_result = await self._database.rpc(
                "execute_agent_command_database_action",
                {"p_command_id": str(command.command_id)},
            )
            if not isinstance(database_result, dict):
                raise StructuredError(
                    code=ErrorCode.DATABASE_RESPONSE_INVALID,
                    summary="The Agent database action returned an invalid safe summary.",
                    retryable=False,
                )
            return {
                str(key): value
                for key, value in database_result.items()
                if value is None or isinstance(value, str | int | float | bool)
            }
        raise StructuredError(
            code=ErrorCode.AGENT_COMMAND_NOT_ALLOWED,
            summary="The requested Agent command type is not allowlisted.",
            retryable=False,
        )

    def _require_inventory_sync(self) -> InventorySyncService:
        if self._inventory_sync is None:
            raise _action_unavailable()
        return self._inventory_sync


def _uuid_payload(command: AgentCommand, key: str) -> UUID:
    value = command.payload.get(key)
    if not isinstance(value, str):
        raise StructuredError(
            code=ErrorCode.AGENT_COMMAND_ACTION_FAILED,
            summary="The Agent command payload is missing a required stable identifier.",
            retryable=False,
        )
    try:
        return UUID(value)
    except ValueError as error:
        raise StructuredError(
            code=ErrorCode.AGENT_COMMAND_ACTION_FAILED,
            summary="The Agent command payload contains an invalid stable identifier.",
            retryable=False,
        ) from error


def _action_unavailable() -> StructuredError:
    return StructuredError(
        code=ErrorCode.AGENT_COMMAND_ACTION_FAILED,
        summary="The requested Agent command is not configured on this Worker.",
        retryable=False,
    )
