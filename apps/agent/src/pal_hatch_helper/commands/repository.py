from collections.abc import Mapping
from datetime import datetime
from typing import Protocol

from pydantic import ValidationError

from pal_hatch_helper.commands.models import AgentCommand
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


class CommandRepository(Protocol):
    async def claim(self, worker_id: str, stale_before: datetime) -> AgentCommand | None: ...

    async def complete(
        self,
        command: AgentCommand,
        worker_id: str,
        safe_summary: Mapping[str, object],
    ) -> None: ...

    async def fail(
        self,
        command: AgentCommand,
        worker_id: str,
        error: StructuredError,
        *,
        rejected: bool,
    ) -> None: ...

    async def heartbeat(self, worker_id: str, deployment_version: str) -> None: ...


class SupabaseCommandRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def claim(self, worker_id: str, stale_before: datetime) -> AgentCommand | None:
        payload = await self._database.rpc(
            "claim_agent_command",
            {
                "p_worker_id": worker_id,
                "p_stale_before": stale_before.isoformat(),
            },
        )
        if payload is None:
            return None
        if isinstance(payload, list):
            if len(payload) > 1:
                raise _invalid_response("claim_agent_command")
            if not payload:
                return None
            payload = payload[0]
        if not isinstance(payload, dict):
            raise _invalid_response("claim_agent_command")
        return _parse_command(payload)

    async def complete(
        self,
        command: AgentCommand,
        worker_id: str,
        safe_summary: Mapping[str, object],
    ) -> None:
        result = await self._database.rpc(
            "complete_agent_command",
            {
                "p_command_id": str(command.command_id),
                "p_worker_id": worker_id,
                "p_safe_summary": _json_object(safe_summary),
            },
        )
        if result is not True:
            raise _invalid_response("complete_agent_command")

    async def fail(
        self,
        command: AgentCommand,
        worker_id: str,
        error: StructuredError,
        *,
        rejected: bool,
    ) -> None:
        result = await self._database.rpc(
            "fail_agent_command",
            {
                "p_command_id": str(command.command_id),
                "p_worker_id": worker_id,
                "p_error_code": error.code.value,
                "p_safe_summary": {"outcome": "rejected" if rejected else "failed"},
                "p_rejected": rejected,
            },
        )
        if result is not True:
            raise _invalid_response("fail_agent_command")

    async def heartbeat(self, worker_id: str, deployment_version: str) -> None:
        result = await self._database.rpc(
            "record_agent_worker_heartbeat",
            {
                "p_worker_kind": "command_worker",
                "p_worker_id": worker_id,
                "p_deployment_version": deployment_version,
                "p_safe_metadata": {},
            },
        )
        if result is not True:
            raise _invalid_response("record_agent_worker_heartbeat")


def _parse_command(payload: dict[str, JSONValue]) -> AgentCommand:
    try:
        return AgentCommand.model_validate(
            {
                "command_id": payload.get("command_id"),
                "command_type": payload.get("command_type"),
                "payload": payload.get("payload"),
                "idempotency_key": payload.get("idempotency_key"),
                "created_at": payload.get("created_at"),
                "expires_at": payload.get("expires_at"),
            }
        )
    except ValidationError as error:
        raise _invalid_response("claim_agent_command") from error


def _json_object(value: Mapping[str, object]) -> dict[str, JSONValue]:
    result: dict[str, JSONValue] = {}
    for key, item in value.items():
        if item is None or isinstance(item, str | int | float | bool):
            result[key] = item
        elif isinstance(item, list):
            result[key] = [str(entry) for entry in item]
        else:
            result[key] = str(item)
    return result


def _invalid_response(function_name: str) -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary=f"{function_name} returned an invalid response.",
        retryable=False,
    )
