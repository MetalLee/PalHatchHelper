"""Generated from packages/contracts/schema. Do not edit directly."""

from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field


def _ensure_unique[T](values: list[T]) -> list[T]:
    if len(values) != len({repr(value) for value in values}):
        raise ValueError("items must be unique")
    return values


class GameCatalogHealth(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["not_configured", "configured", "error"]
    active_version_id: UUID | None
    cache_status: Literal["empty", "warm", "error"]


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


type StableId = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=120),
    Field(pattern="^[a-z0-9][a-z0-9._-]*$"),
]


type NonEmptyText = Annotated[str, Field(min_length=1), Field(max_length=200)]


type SchemaVersion = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=40),
    Field(pattern="^[0-9]+\\.[0-9]+\\.[0-9]+$"),
]


type Sha256 = Annotated[str, Field(pattern="^[0-9a-f]{64}$")]


type Locale = Annotated[
    str,
    Field(min_length=2),
    Field(max_length=35),
    Field(pattern="^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"),
]


type TextKey = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=200),
    Field(pattern="^[A-Za-z0-9][A-Za-z0-9._-]*$"),
]


type Metadata = dict[str, object]


class CatalogCounts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pals: Annotated[int, Field(ge=0)]
    passive_skills: Annotated[int, Field(ge=0)]
    active_skills: Annotated[int, Field(ge=0)]
    pal_active_skills: Annotated[int, Field(ge=0)]
    partner_skills: Annotated[int, Field(ge=0)]
    breeding_recipes: Annotated[int, Field(ge=0)]
    localizations: Annotated[int, Field(ge=0)]


class CatalogFileChecksum(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: Literal[
        "pals.jsonl",
        "passive-skills.jsonl",
        "active-skills.jsonl",
        "pal-active-skills.jsonl",
        "partner-skills.jsonl",
        "breeding-recipes.jsonl",
        "localizations.jsonl",
    ]
    sha256: Sha256
    record_count: Annotated[int, Field(ge=0)]


class GameDataVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    game_build_id: Annotated[str, Field(max_length=200)] | None
    game_version: Annotated[str, Field(max_length=120)] | None
    package_hash: Sha256
    content_hash: Sha256
    schema_version: SchemaVersion
    extractor_name: NonEmptyText
    extractor_version: NonEmptyText
    artifact_bucket: Annotated[str, Field(max_length=120)] | None
    artifact_path: Annotated[str, Field(max_length=500)] | None
    status: Literal["extracting", "staging", "validated", "published", "rejected"]
    imported_at: AwareDatetime
    validated_at: AwareDatetime | None
    published_at: AwareDatetime | None


class CatalogPal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pal_id: StableId
    encyclopedia_no: Annotated[int, Field(ge=1)] | None
    name_key: TextKey
    element_types: Annotated[list[StableId], Field(min_length=1), AfterValidator(_ensure_unique)]
    rarity: Annotated[int, Field(ge=0)]
    breeding_power: Annotated[int, Field(ge=0)]
    metadata: Metadata


class CatalogPassiveSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passive_skill_id: StableId
    name_key: TextKey
    description_key: TextKey | None
    rank: Annotated[int, Field(ge=0)]
    is_negative: bool
    metadata: Metadata


class CatalogActiveSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    active_skill_id: StableId
    name_key: TextKey
    element_type: StableId
    power: Annotated[int, Field(ge=0)] | None
    cooldown_seconds: Annotated[float, Field(ge=0)] | None
    metadata: Metadata


class CatalogPalActiveSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pal_id: StableId
    active_skill_id: StableId
    learn_level: Annotated[int, Field(ge=0)]
    is_exclusive: bool
    metadata: Metadata


class CatalogPartnerSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")

    partner_skill_id: StableId
    pal_id: StableId
    name_key: TextKey
    description_key: TextKey | None
    metadata: Metadata


class CatalogLocalization(BaseModel):
    model_config = ConfigDict(extra="forbid")

    locale: Locale
    text_key: TextKey
    text: Annotated[str, Field(max_length=10000)]


class CatalogBreedingRecipe(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_a_pal_id: StableId
    parent_b_pal_id: StableId
    child_pal_id: StableId
    recipe_type: Literal["normal", "special"]
    metadata: Metadata


class CatalogValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersion
    content_hash: Sha256 | None
    valid: bool
    errors: Annotated[
        list[Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]],
        AfterValidator(_ensure_unique),
    ]
    warnings: Annotated[
        list[Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]],
        AfterValidator(_ensure_unique),
    ]
    counts: CatalogCounts


class CanonicalServer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    world_uid: Annotated[str, Field(min_length=1), Field(max_length=128)]
    save_version: Annotated[str, Field(min_length=1), Field(max_length=120)] | None
    captured_at: AwareDatetime


class CanonicalGuild(BaseModel):
    model_config = ConfigDict(extra="forbid")

    guild_uid: Annotated[str, Field(min_length=1), Field(max_length=128)]
    name: Annotated[str, Field(min_length=1), Field(max_length=120)]


class CanonicalPlayer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_uid: Annotated[str, Field(min_length=1), Field(max_length=128)]
    nickname: Annotated[str, Field(min_length=1), Field(max_length=120)]
    level: Annotated[int, Field(ge=1), Field(le=100)] | None
    guild_uid: Annotated[str, Field(min_length=1), Field(max_length=128)] | None


class CanonicalPal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_uid: Annotated[str, Field(min_length=1), Field(max_length=160)]
    owner_player_uid: Annotated[str, Field(min_length=1), Field(max_length=128)] | None
    guild_uid: Annotated[str, Field(min_length=1), Field(max_length=128)] | None
    pal_id: Annotated[str, Field(min_length=1), Field(max_length=120)]
    gender: Literal["male", "female", "genderless", "unknown"]
    level: Annotated[int, Field(ge=1), Field(le=100)] | None
    passive_skill_ids: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=120)]],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    location_type: Literal["player_party", "player_storage", "base", "viewing_cage", "unknown"]
    location_name: Annotated[str, Field(min_length=1), Field(max_length=160)] | None


class InventoryValidationWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, Field(max_length=100), Field(pattern="^[A-Z][A-Z0-9_]*$")]
    path: Annotated[str, Field(min_length=1), Field(max_length=240)]
    value: Annotated[str, Field(max_length=240)]


class InventoryPublishPal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_uid: Annotated[str, Field(min_length=1), Field(max_length=160)]
    owner_player_uid: Annotated[str, Field(min_length=1), Field(max_length=128)] | None
    guild_uid: Annotated[str, Field(min_length=1), Field(max_length=128)] | None
    pal_id: Annotated[str, Field(min_length=1), Field(max_length=120)]
    gender: Literal["male", "female", "genderless", "unknown"]
    level: Annotated[int, Field(ge=1), Field(le=100)] | None
    passive_skill_ids: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=120)]],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    location_type: Literal["player_party", "player_storage", "base", "viewing_cage", "unknown"]
    location_name: Annotated[str, Field(min_length=1), Field(max_length=160)] | None
    owner_resolved: bool
    guild_resolved: bool
    shared_eligible: bool
    warning_codes: Annotated[
        list[Annotated[str, Field(max_length=100), Field(pattern="^[A-Z][A-Z0-9_]*$")]],
        AfterValidator(_ensure_unique),
    ]


class InventoryPublishPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_save_hash: Annotated[str, Field(min_length=32), Field(max_length=128)]
    source_modified_at: AwareDatetime
    save_version: Annotated[str, Field(min_length=1), Field(max_length=120)] | None
    captured_at: AwareDatetime
    parser_name: Annotated[str, Field(min_length=1), Field(max_length=100)]
    parser_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    server: CanonicalServer
    guilds: list[CanonicalGuild]
    players: list[CanonicalPlayer]
    pals: list[InventoryPublishPal]
    warnings: list[InventoryValidationWarning]


class InventoryFailurePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_save_hash: Annotated[str, Field(min_length=32), Field(max_length=128)]
    source_modified_at: AwareDatetime
    captured_at: AwareDatetime
    parser_name: Annotated[str, Field(min_length=1), Field(max_length=100)]
    parser_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    status: Literal["failed", "rejected"]
    error_code: Annotated[str, Field(max_length=100), Field(pattern="^[A-Z][A-Z0-9_]*$")]
    error_summary: Annotated[str, Field(max_length=500)]


class InventoryFailureRpcRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    world_id: UUID
    failure: InventoryFailurePayload


class ReadinessStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["ready", "not_ready"]
    service: Annotated[str, Field(min_length=1)]
    version: Annotated[str, Field(min_length=1)]
    timestamp: AwareDatetime
    error_code: Annotated[str, Field(pattern="^[a-z][a-z0-9_]*$")] | None
    database_configured: bool
    job_worker_configured: bool
    save_worker_configured: bool
    game_catalog: GameCatalogHealth


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
    game_data_version_id: UUID
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


class GameCatalogManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: SchemaVersion
    game_build_id: NonEmptyText
    game_version: NonEmptyText
    package_hash: Sha256
    content_hash: Sha256
    extractor_name: NonEmptyText
    extractor_version: NonEmptyText
    created_at: AwareDatetime
    locales: Annotated[list[Locale], Field(min_length=1), AfterValidator(_ensure_unique)]
    counts: CatalogCounts
    files: Annotated[list[CatalogFileChecksum], Field(min_length=1), AfterValidator(_ensure_unique)]
    compression: Literal["tar.gz", "tar.zst"]


class CanonicalSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    server: CanonicalServer
    guilds: list[CanonicalGuild]
    players: list[CanonicalPlayer]
    pals: list[CanonicalPal]


class InventoryPublishRpcRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    world_id: UUID
    snapshot: InventoryPublishPayload
