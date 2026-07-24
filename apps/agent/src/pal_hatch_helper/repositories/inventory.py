from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol, TypeGuard
from uuid import UUID

from pal_hatch_helper.generated import (
    InventoryFailureRpcRequest,
    InventoryPublishRpcRequest,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.normalization.validator import ValidatedSnapshot
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


@dataclass(frozen=True, slots=True)
class LatestInventorySnapshot:
    snapshot_id: UUID
    source_save_hash: str
    pal_count: int
    parser_name: str
    parser_version: str


@dataclass(frozen=True, slots=True)
class InventoryPublishRequest:
    world_id: UUID
    source_save_hash: str
    source_modified_at: datetime
    parser_name: str
    parser_version: str
    snapshot: ValidatedSnapshot


@dataclass(frozen=True, slots=True)
class InventoryFailureRequest:
    world_id: UUID
    source_save_hash: str
    source_modified_at: datetime
    parser_name: str
    parser_version: str
    status: Literal["failed", "rejected"]
    error_code: ErrorCode
    error_summary: str


@dataclass(frozen=True, slots=True)
class InventoryCatalogIds:
    pal_ids: frozenset[str]
    passive_skill_ids: frozenset[str]


@dataclass(frozen=True, slots=True)
class InventoryCleanupResult:
    purged_snapshot_count: int
    deleted_item_count: int
    deleted_failure_count: int
    deleted_detection_run_count: int


class InventoryRepository(Protocol):
    async def latest(self, world_id: UUID) -> LatestInventorySnapshot | None: ...

    async def publish(self, request: InventoryPublishRequest) -> UUID: ...

    async def record_failure(self, request: InventoryFailureRequest) -> UUID: ...

    async def cleanup_expired_payloads(self) -> InventoryCleanupResult: ...


class SupabaseInventoryRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def latest(self, world_id: UUID) -> LatestInventorySnapshot | None:
        payload = await self._database.rpc(
            "get_latest_inventory_snapshot_for_agent",
            {"p_world_id": str(world_id)},
        )
        if payload is None or payload == []:
            return None
        if isinstance(payload, list) and len(payload) == 1:
            payload = payload[0]
        if not isinstance(payload, dict):
            raise _invalid_response()
        try:
            snapshot_id = payload["snapshot_id"]
            source_hash = payload["source_save_hash"]
            pal_count = payload["pal_count"]
            parser_name = payload["parser_name"]
            parser_version = payload["parser_version"]
            if (
                not isinstance(snapshot_id, str)
                or not isinstance(source_hash, str)
                or not isinstance(pal_count, int)
                or isinstance(pal_count, bool)
                or pal_count < 0
                or not isinstance(parser_name, str)
                or not parser_name
                or not isinstance(parser_version, str)
                or not parser_version
            ):
                raise ValueError("invalid latest snapshot fields")
            return LatestInventorySnapshot(
                snapshot_id=UUID(snapshot_id),
                source_save_hash=source_hash,
                pal_count=pal_count,
                parser_name=parser_name,
                parser_version=parser_version,
            )
        except (KeyError, ValueError) as error:
            raise _invalid_response() from error

    async def publish(self, request: InventoryPublishRequest) -> UUID:
        rpc_request = InventoryPublishRpcRequest.model_validate(
            {
                "world_id": request.world_id,
                "snapshot": _publish_payload(request),
            }
        )
        payload = await self._database.rpc(
            "publish_inventory_snapshot",
            {
                "p_world_id": str(rpc_request.world_id),
                "p_snapshot": _json_object(rpc_request.snapshot.model_dump(mode="json")),
            },
        )
        if not isinstance(payload, str):
            raise _invalid_response()
        try:
            return UUID(payload)
        except ValueError as error:
            raise _invalid_response() from error

    async def record_failure(self, request: InventoryFailureRequest) -> UUID:
        rpc_request = InventoryFailureRpcRequest.model_validate(
            {
                "world_id": request.world_id,
                "failure": {
                    "source_save_hash": request.source_save_hash,
                    "source_modified_at": request.source_modified_at,
                    "captured_at": request.source_modified_at,
                    "parser_name": request.parser_name,
                    "parser_version": request.parser_version,
                    "status": request.status,
                    "error_code": request.error_code.value,
                    "error_summary": request.error_summary,
                },
            }
        )
        payload = await self._database.rpc(
            "record_inventory_snapshot_failure",
            {
                "p_world_id": str(rpc_request.world_id),
                "p_failure": _json_object(rpc_request.failure.model_dump(mode="json")),
            },
        )
        if not isinstance(payload, str):
            raise _invalid_response()
        try:
            return UUID(payload)
        except ValueError as error:
            raise _invalid_response() from error

    async def cleanup_expired_payloads(self) -> InventoryCleanupResult:
        payload = await self._database.rpc(
            "cleanup_expired_inventory_snapshot_payloads",
            {"p_batch_size": 25},
        )
        if not isinstance(payload, dict):
            raise _invalid_response()
        try:
            purged_snapshot_count = payload["purged_snapshot_count"]
            deleted_item_count = payload["deleted_item_count"]
            deleted_failure_count = payload["deleted_failure_count"]
            deleted_detection_run_count = payload["deleted_detection_run_count"]
            if (
                not _is_nonnegative_int(purged_snapshot_count)
                or not _is_nonnegative_int(deleted_item_count)
                or not _is_nonnegative_int(deleted_failure_count)
                or not _is_nonnegative_int(deleted_detection_run_count)
            ):
                raise ValueError("invalid inventory cleanup counts")
            return InventoryCleanupResult(
                purged_snapshot_count=purged_snapshot_count,
                deleted_item_count=deleted_item_count,
                deleted_failure_count=deleted_failure_count,
                deleted_detection_run_count=deleted_detection_run_count,
            )
        except (KeyError, ValueError) as error:
            raise _invalid_response() from error

    async def catalog_ids(self, world_id: UUID) -> InventoryCatalogIds:
        payload = await self._database.rpc(
            "get_inventory_catalog_ids_for_agent",
            {"p_world_id": str(world_id)},
        )
        if not isinstance(payload, dict):
            raise _invalid_response()
        pal_ids = payload.get("pal_ids")
        passive_ids = payload.get("passive_skill_ids")
        if not _is_string_list(pal_ids) or not _is_string_list(passive_ids):
            raise _invalid_response()
        return InventoryCatalogIds(
            pal_ids=frozenset(pal_ids),
            passive_skill_ids=frozenset(passive_ids),
        )


def _publish_payload(request: InventoryPublishRequest) -> dict[str, JSONValue]:
    canonical = request.snapshot.canonical
    pals: list[JSONValue] = []
    for validated in request.snapshot.pals:
        pal = validated.canonical
        pals.append(
            {
                **_json_object(pal.model_dump(mode="json")),
                "owner_resolved": validated.owner_resolved,
                "guild_resolved": validated.guild_resolved,
                "shared_eligible": validated.shared_eligible,
                "warning_codes": list(validated.warning_codes),
            }
        )
    warnings: list[JSONValue] = [
        {"code": warning.code, "path": warning.path, "value": warning.value}
        for warning in request.snapshot.warnings
    ]
    return {
        "source_save_hash": request.source_save_hash,
        "source_modified_at": request.source_modified_at.isoformat(),
        "save_version": canonical.server.save_version,
        "captured_at": canonical.server.captured_at.isoformat(),
        "parser_name": request.parser_name,
        "parser_version": request.parser_version,
        "server": _json_object(canonical.server.model_dump(mode="json")),
        "guilds": [_json_object(guild.model_dump(mode="json")) for guild in canonical.guilds],
        "players": [_json_object(player.model_dump(mode="json")) for player in canonical.players],
        "pals": pals,
        "warnings": warnings,
    }


def _json_object(value: object) -> dict[str, JSONValue]:
    if not _is_json_object(value):
        raise TypeError("Expected generated model to serialize to a JSON object")
    return value


def _is_json_value(value: object) -> TypeGuard[JSONValue]:
    if value is None or isinstance(value, str | int | float | bool):
        return True
    if isinstance(value, list):
        return all(_is_json_value(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json_value(item) for key, item in value.items())
    return False


def _is_json_object(value: object) -> TypeGuard[dict[str, JSONValue]]:
    return isinstance(value, dict) and _is_json_value(value)


def _is_string_list(value: object) -> TypeGuard[list[str]]:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _is_nonnegative_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _invalid_response() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Supabase returned an invalid inventory snapshot response.",
        retryable=False,
    )
