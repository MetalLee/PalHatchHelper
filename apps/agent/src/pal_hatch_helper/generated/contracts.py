"""Generated from packages/contracts/schema. Do not edit directly."""

from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field


def _ensure_unique[T](values: list[T]) -> list[T]:
    if len(values) != len({repr(value) for value in values}):
        raise ValueError("items must be unique")
    return values


class OptimizationMode(StrEnum):
    BALANCED = "balanced"
    FASTEST = "fastest"
    HIGHEST_SUCCESS = "highest_success"
    LEAST_BORROWING = "least_borrowing"


class BreedingJobStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    ALGORITHM_COMPLETED = "algorithm_completed"
    AI_ENRICHING = "ai_enriching"
    RETRY_PENDING = "retry_pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PalGender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    GENDERLESS = "genderless"
    UNKNOWN = "unknown"


class PalLocationType(StrEnum):
    PLAYER_PARTY = "player_party"
    PLAYER_STORAGE = "player_storage"
    BASE = "base"
    VIEWING_CAGE = "viewing_cage"
    UNKNOWN = "unknown"


class ReadinessStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "not_ready"]
    service: Annotated[str, Field(min_length=1)]
    version: Annotated[str, Field(min_length=1)]
    timestamp: AwareDatetime
    error_code: Annotated[str, Field(pattern="^[a-z][a-z0-9_]*$")] | None
    database_configured: bool
    job_worker_configured: bool


class BreedingJob(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: UUID
    requester_user_id: UUID
    player_id: UUID
    guild_id: UUID | None
    target_pal_id: Annotated[str, Field(min_length=1), Field(max_length=120)]
    desired_passive_ids: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=120)]],
        Field(min_length=0),
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    optimization_mode: OptimizationMode
    inventory_snapshot_id: UUID
    breeding_data_version_id: UUID
    algorithm_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    status: BreedingJobStatus
    attempt_count: Annotated[int, Field(ge=0)]
    error_code: Annotated[str, Field(max_length=100), Field(pattern="^[A-Z][A-Z0-9_]*$")] | None
    created_at: AwareDatetime
    completed_at: AwareDatetime | None


class PalListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    snapshot_id: UUID
    pal_instance_uid: Annotated[str, Field(min_length=1), Field(max_length=160)]
    pal_id: Annotated[str, Field(min_length=1), Field(max_length=120)]
    owner_player_id: UUID
    owner_display_name: Annotated[str, Field(min_length=1), Field(max_length=120)]
    guild_id: UUID | None
    gender: PalGender
    level: Annotated[int, Field(ge=1), Field(le=100)] | None
    passive_skill_ids: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=120)]],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    location_type: PalLocationType
    location_name: Annotated[str, Field(max_length=160)] | None
    share_enabled: bool
    is_owned_by_requester: bool
