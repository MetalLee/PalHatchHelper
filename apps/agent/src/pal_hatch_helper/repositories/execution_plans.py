from typing import Literal, Protocol, TypeGuard, cast
from uuid import UUID

from pal_hatch_helper.generated import (
    CandidateDetectionBatchRequest,
    CandidateDetectionWrite,
    DetectionStepContext,
)
from pal_hatch_helper.models.errors import ErrorCode, StructuredError
from pal_hatch_helper.plans.candidates import SnapshotPal
from pal_hatch_helper.repositories.database import DatabaseClient, JSONValue


class ExecutionPlanRepository(Protocol):
    async def detection_contexts(self, snapshot_id: UUID) -> tuple[DetectionStepContext, ...]: ...

    async def snapshot_delta(
        self, step_id: UUID, snapshot_id: UUID
    ) -> tuple[tuple[SnapshotPal, ...], tuple[SnapshotPal, ...], frozenset[str]]: ...

    async def record_candidates(
        self,
        step_id: UUID,
        snapshot_id: UUID,
        candidates: tuple[CandidateDetectionWrite, ...],
    ) -> int: ...

    async def invalidate_dependencies(self, snapshot_id: UUID) -> int: ...


class SupabaseExecutionPlanRepository:
    def __init__(self, database: DatabaseClient) -> None:
        self._database = database

    async def detection_contexts(self, snapshot_id: UUID) -> tuple[DetectionStepContext, ...]:
        payload = await self._database.rpc(
            "get_execution_detection_context",
            {"p_detected_snapshot_id": str(snapshot_id)},
        )
        if not isinstance(payload, list):
            raise _invalid_response()
        try:
            return tuple(DetectionStepContext.model_validate(item) for item in payload)
        except (TypeError, ValueError) as error:
            raise _invalid_response() from error

    async def snapshot_delta(
        self, step_id: UUID, snapshot_id: UUID
    ) -> tuple[tuple[SnapshotPal, ...], tuple[SnapshotPal, ...], frozenset[str]]:
        payload = await self._database.rpc(
            "get_execution_snapshot_delta",
            {"p_step_id": str(step_id), "p_detected_snapshot_id": str(snapshot_id)},
        )
        if not isinstance(payload, dict):
            raise _invalid_response()
        baseline = payload.get("baseline")
        current = payload.get("current")
        seen = payload.get("seen_before_or_at_baseline")
        if (
            not isinstance(baseline, list)
            or not isinstance(current, list)
            or not _string_list(seen)
        ):
            raise _invalid_response()
        try:
            return (
                tuple(_snapshot_pal(item) for item in baseline),
                tuple(_snapshot_pal(item) for item in current),
                frozenset(seen),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise _invalid_response() from error

    async def record_candidates(
        self,
        step_id: UUID,
        snapshot_id: UUID,
        candidates: tuple[CandidateDetectionWrite, ...],
    ) -> int:
        request = CandidateDetectionBatchRequest(
            step_id=step_id,
            detected_snapshot_id=snapshot_id,
            candidates=list(candidates),
        )
        payload = await self._database.rpc(
            "record_execution_candidates",
            {
                "p_step_id": str(request.step_id),
                "p_detected_snapshot_id": str(request.detected_snapshot_id),
                "p_candidates": [
                    _json_object(candidate.model_dump(mode="json"))
                    for candidate in request.candidates
                ],
            },
        )
        if not isinstance(payload, int) or isinstance(payload, bool) or payload < 0:
            raise _invalid_response()
        return payload

    async def invalidate_dependencies(self, snapshot_id: UUID) -> int:
        payload = await self._database.rpc(
            "invalidate_execution_plan_dependencies",
            {"p_detected_snapshot_id": str(snapshot_id)},
        )
        if not isinstance(payload, int) or isinstance(payload, bool) or payload < 0:
            raise _invalid_response()
        return payload


def _snapshot_pal(value: object) -> SnapshotPal:
    if not isinstance(value, dict):
        raise TypeError("snapshot item must be an object")
    passives = value["passive_skill_ids"]
    if not _string_list(passives):
        raise TypeError("snapshot passives must be strings")
    gender = _string(value["gender"])
    location_type = _string(value["location_type"])
    if gender not in ("male", "female", "genderless", "unknown"):
        raise TypeError("snapshot gender is invalid")
    if location_type not in (
        "player_party",
        "player_storage",
        "base",
        "dimensional_storage",
        "viewing_cage",
        "unknown",
    ):
        raise TypeError("snapshot location is invalid")
    return SnapshotPal(
        instance_uid=_string(value["instance_uid"]),
        pal_id=_string(value["pal_id"]),
        gender=cast(Literal["male", "female", "genderless", "unknown"], gender),
        passive_skill_ids=tuple(passives),
        level=_optional_int(value["level"]),
        owner_display_name=_string(value["owner_display_name"]),
        location_type=cast(
            Literal[
                "player_party",
                "player_storage",
                "base",
                "dimensional_storage",
                "viewing_cage",
                "unknown",
            ],
            location_type,
        ),
        location_name=_optional_string(value["location_name"]),
        accessible=_boolean(value["accessible"]),
    )


def _string(value: object) -> str:
    if not isinstance(value, str):
        raise TypeError("expected string")
    return value


def _optional_string(value: object) -> str | None:
    if value is None or isinstance(value, str):
        return value
    raise TypeError("expected optional string")


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise TypeError("expected optional integer")
    return value


def _boolean(value: object) -> bool:
    if not isinstance(value, bool):
        raise TypeError("expected boolean")
    return value


def _string_list(value: object) -> TypeGuard[list[str]]:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def _json_object(value: object) -> dict[str, JSONValue]:
    if not isinstance(value, dict):
        raise TypeError("expected JSON object")
    return cast(dict[str, JSONValue], value)


def _invalid_response() -> StructuredError:
    return StructuredError(
        code=ErrorCode.DATABASE_RESPONSE_INVALID,
        summary="Supabase returned an invalid execution-plan response.",
        retryable=False,
    )
