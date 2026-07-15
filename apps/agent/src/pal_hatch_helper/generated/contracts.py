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


type StableId = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=120),
    Field(pattern="^[a-z0-9][a-z0-9._-]*$"),
]


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


class BreedingSourceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    source_type: Literal["github", "url", "upload"]
    source_name: NonEmptyText
    source_version: NonEmptyText
    filename: Annotated[str, Field(min_length=1), Field(max_length=255)]
    raw_content_hash: Sha256
    fetched_at: AwareDatetime
    base_content_hash: Sha256


class CompatibilityStatus(StrEnum):
    EXACT_GAME_VERSION_MATCH = "exact_game_version_match"
    MISMATCH = "mismatch"
    UNKNOWN = "unknown"


class SourceProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extraction_mode: Literal["full_game_catalog"]
    upstream_reference_repository: Literal["tylercamp/palcalc"]
    upstream_reference_commit: Literal["b822c7fda4f019bd7c57f45437f14a74061a29bc"]
    upstream_license: Literal["MIT"]
    extractor_repository_commit: Annotated[str, Field(min_length=1), Field(max_length=120)]
    extractor_build: NonEmptyText
    cue4parse_version: Literal["1.2.2.202607"]
    source_client_app_id: Literal["1623730"]
    source_client_build_id: NonEmptyText
    source_client_appmanifest_sha256: Sha256
    source_client_game_version: NonEmptyText
    target_server_app_id: NonEmptyText
    target_server_build_id: NonEmptyText
    target_server_appmanifest_sha256: Sha256
    target_server_game_version: NonEmptyText
    mappings_usmap_sha256: Sha256
    source_package_manifest_sha256: Sha256
    extracted_at: AwareDatetime
    compatibility_status: CompatibilityStatus
    compatibility_evidence: Annotated[
        list[NonEmptyText],
        Field(min_length=1),
        AfterValidator(_ensure_unique),
    ]


class GameDataSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    name: NonEmptyText
    source_type: Literal["game_package", "github", "url", "upload"]
    source_path: Annotated[str, Field(max_length=1000)] | None
    source_url: Annotated[str, Field(max_length=1000)] | None
    enabled: bool


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


type BreedingStableId = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=120),
    Field(pattern="^[a-z0-9][a-z0-9._-]*$"),
]


type BreedingSha256 = Annotated[str, Field(pattern="^[0-9a-f]{64}$")]


type BreedingSourceVersion = Annotated[str, Field(min_length=1), Field(max_length=120)]


type BreedingMetadata = dict[str, object]


class BreedingRecipeType(StrEnum):
    NORMAL = "normal"
    SPECIAL = "special"


class BreedingRecipeSourceRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parents: Annotated[list[BreedingStableId], Field(min_length=2), Field(max_length=2)]
    child_pal_id: BreedingStableId
    recipe_type: BreedingRecipeType
    metadata: BreedingMetadata


class StagedBreedingSourceMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    source_type: Literal["github", "url", "upload"]
    source_name: Annotated[str, Field(min_length=1), Field(max_length=120)]
    source_version: BreedingSourceVersion
    filename: Annotated[str, Field(min_length=1), Field(max_length=255)]
    raw_content_hash: BreedingSha256
    fetched_at: AwareDatetime


class BreedingDataValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]
    record_indexes: Annotated[list[Annotated[int, Field(ge=0)]], AfterValidator(_ensure_unique)]


class BreedingDataValidationCounts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_records: Annotated[int, Field(ge=0)]
    normalized_records: Annotated[int, Field(ge=0)]
    normal_recipes: Annotated[int, Field(ge=0)]
    special_recipes: Annotated[int, Field(ge=0)]
    special_overrides: Annotated[int, Field(ge=0)]


class BreedingDataValidationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0.0"]
    raw_content_hash: BreedingSha256
    source_version: BreedingSourceVersion
    valid: bool
    errors: list[BreedingDataValidationIssue]
    warnings: list[BreedingDataValidationIssue]
    counts: BreedingDataValidationCounts


class BreedingRecipeSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_a_pal_id: BreedingStableId
    parent_b_pal_id: BreedingStableId
    child_pal_id: BreedingStableId
    recipe_type: BreedingRecipeType
    metadata: BreedingMetadata


class BreedingRecipeChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_a_pal_id: BreedingStableId
    parent_b_pal_id: BreedingStableId
    recipe_type: BreedingRecipeType
    before_child_pal_id: BreedingStableId
    after_child_pal_id: BreedingStableId
    metadata_changed: bool


class BreedingDataDiffCounts(BaseModel):
    model_config = ConfigDict(extra="forbid")

    added: Annotated[int, Field(ge=0)]
    removed: Annotated[int, Field(ge=0)]
    changed: Annotated[int, Field(ge=0)]
    unchanged: Annotated[int, Field(ge=0)]


class BreedingDataDiffReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal["1.0.0"]
    from_content_hash: BreedingSha256
    to_content_hash: BreedingSha256
    added: list[BreedingRecipeSnapshot]
    removed: list[BreedingRecipeSnapshot]
    changed: list[BreedingRecipeChange]
    counts: BreedingDataDiffCounts


type BreedingEngineStableId = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=120),
    Field(pattern="^[a-z0-9][a-z0-9._-]*$"),
]


type BreedingEngineVersion = Annotated[str, Field(min_length=1), Field(max_length=100)]


type BreedingEngineInstanceUid = Annotated[str, Field(min_length=1), Field(max_length=160)]


class BreedingEngineGender(StrEnum):
    MALE = "male"
    FEMALE = "female"
    GENDERLESS = "genderless"
    UNKNOWN = "unknown"


class BreedingRequiredGender(StrEnum):
    MALE = "male"
    FEMALE = "female"


class BreedingEngineLocationType(StrEnum):
    PLAYER_PARTY = "player_party"
    PLAYER_STORAGE = "player_storage"
    BASE = "base"
    VIEWING_CAGE = "viewing_cage"
    UNKNOWN = "unknown"


class BreedingDifficulty(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class BreedingSourceType(StrEnum):
    INVENTORY = "inventory"
    INTERMEDIATE = "intermediate"


class BreedingSearchLimit(StrEnum):
    MAX_EXPANDED_NODES = "max_expanded_nodes"
    TIMEOUT = "timeout"
    SPECIES_ROUTE_CAP = "species_route_cap"
    ASSIGNMENT_STATE_CAP = "assignment_state_cap"
    CANDIDATE_CAP = "candidate_cap"


class BreedingInventoryExclusionReason(StrEnum):
    DISAPPEARED = "disappeared"
    DISABLED = "disabled"
    UNRESOLVED = "unresolved"
    LOCKED = "locked"
    SHARED_INVENTORY_DISABLED = "shared_inventory_disabled"
    DIFFERENT_GUILD = "different_guild"
    SHARE_DISABLED = "share_disabled"


class BreedingScoreComponentName(StrEnum):
    ROUTE_LENGTH = "route_length"
    INVENTORY_COVERAGE = "inventory_coverage"
    PASSIVE_CONCENTRATION = "passive_concentration"
    BORROWING = "borrowing"
    INTERMEDIATE_COST = "intermediate_cost"
    ATTEMPT_COST = "attempt_cost"
    STABILITY = "stability"


class BreedingSearchLimits(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_generations: Annotated[int, Field(ge=0), Field(le=8)]
    max_expanded_nodes: Annotated[int, Field(ge=1), Field(le=10000000)]
    timeout_ms: Annotated[int, Field(ge=1), Field(le=300000)]
    max_species_routes_per_pal: Annotated[int, Field(ge=3), Field(le=100000)]
    max_assignment_states_per_mask: Annotated[int, Field(ge=3), Field(le=10000)]
    max_candidate_routes: Annotated[int, Field(ge=3), Field(le=100000)]
    max_results: Annotated[int, Field(ge=4), Field(le=1000)]


class BreedingEngineInventoryPal(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instance_uid: BreedingEngineInstanceUid
    pal_id: BreedingEngineStableId
    owner_player_id: UUID | None
    guild_id: UUID | None
    gender: BreedingEngineGender
    passive_skill_ids: Annotated[
        list[BreedingEngineStableId],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    location_type: BreedingEngineLocationType
    location_name: Annotated[str, Field(max_length=160)] | None
    share_enabled: bool
    owner_resolved: bool
    guild_resolved: bool
    present_in_snapshot: bool
    breeding_enabled: bool
    plan_locked: bool


class BreedingInventoryExclusion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: BreedingInventoryExclusionReason
    count: Annotated[int, Field(ge=1)]


class BreedingParentSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: BreedingSourceType
    pal_id: BreedingEngineStableId
    instance_uid: BreedingEngineInstanceUid | None
    owner_player_id: UUID | None
    guild_id: UUID | None
    gender: BreedingEngineGender | None
    passive_skill_ids: Annotated[
        list[BreedingEngineStableId],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    required_passive_ids: Annotated[
        list[BreedingEngineStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    borrowed: bool
    produced_by_step_index: Annotated[int, Field(ge=0)] | None
    location_type: BreedingEngineLocationType | None
    location_name: Annotated[str, Field(max_length=160)] | None


class BreedingRouteStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_index: Annotated[int, Field(ge=0)]
    generation: Annotated[int, Field(ge=1), Field(le=8)]
    recipe_type: Literal["normal", "special"]
    parent_a: BreedingParentSource
    parent_b: BreedingParentSource
    child_pal_id: BreedingEngineStableId
    child_required_gender: BreedingRequiredGender | None
    required_passive_ids: Annotated[
        list[BreedingEngineStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]


class BreedingRawScoreMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    generation_count: Annotated[int, Field(ge=0)]
    step_count: Annotated[int, Field(ge=0)]
    unique_starting_instance_count: Annotated[int, Field(ge=1)]
    borrowed_pal_count: Annotated[int, Field(ge=0)]
    inventory_coverage: Annotated[float, Field(ge=0), Field(le=1)]
    passive_carrier_count: Annotated[int, Field(ge=0)]
    passive_concentration: Annotated[float, Field(ge=0), Field(le=1)]
    extra_passive_count: Annotated[int, Field(ge=0)]
    intermediate_pal_count: Annotated[int, Field(ge=0)]
    intermediate_passive_checkpoint_count: Annotated[int, Field(ge=0)]
    required_gender_checkpoint_count: Annotated[int, Field(ge=0)]
    estimated_attempts_min: Annotated[int, Field(ge=0)]
    estimated_attempts_max: Annotated[int, Field(ge=0)]
    difficulty: BreedingDifficulty


class BreedingScoreComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component: BreedingScoreComponentName
    raw_value: Annotated[float, Field(ge=0)]
    normalized_score: Annotated[float, Field(ge=0), Field(le=100)]
    weight: Annotated[float, Field(ge=0), Field(le=1)]
    weighted_score: Annotated[float, Field(ge=0), Field(le=100)]


class BreedingModeScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    optimization_mode: OptimizationMode
    scoring_profile_version: BreedingEngineVersion
    total_score: Annotated[float, Field(ge=0), Field(le=100)]
    components: Annotated[list[BreedingScoreComponent], Field(min_length=7), Field(max_length=7)]


class BreedingScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scoring_profile_version: BreedingEngineVersion
    estimate_basis: Literal["strategy_heuristic_no_verified_probability"]
    raw_metrics: BreedingRawScoreMetrics
    mode_scores: Annotated[list[BreedingModeScore], Field(min_length=4), Field(max_length=4)]


class BreedingRouteCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route_key: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    rank: Annotated[int, Field(ge=1)]
    optimization_mode: OptimizationMode
    total_score: Annotated[float, Field(ge=0), Field(le=100)]
    generation_count: Annotated[int, Field(ge=0), Field(le=8)]
    step_count: Annotated[int, Field(ge=0)]
    estimated_attempts_min: Annotated[int, Field(ge=0)]
    estimated_attempts_max: Annotated[int, Field(ge=0)]
    difficulty: BreedingDifficulty
    borrowed_pal_count: Annotated[int, Field(ge=0)]
    inventory_coverage: Annotated[float, Field(ge=0), Field(le=1)]
    inheritance_score: Annotated[float, Field(ge=0), Field(le=1)]
    existing_target_instance_uid: BreedingEngineInstanceUid | None
    score_breakdown: BreedingScoreBreakdown
    steps: list[BreedingRouteStep]


class BreedingModeRanking(BaseModel):
    model_config = ConfigDict(extra="forbid")

    optimization_mode: OptimizationMode
    scoring_profile_version: BreedingEngineVersion
    route_keys: Annotated[
        list[Annotated[str, Field(pattern="^[0-9a-f]{64}$")]],
        AfterValidator(_ensure_unique),
    ]


class BreedingSearchDiagnostics(BaseModel):
    model_config = ConfigDict(extra="forbid")

    graph_pal_count: Annotated[int, Field(ge=0)]
    effective_recipe_count: Annotated[int, Field(ge=0)]
    inventory_input_count: Annotated[int, Field(ge=0)]
    eligible_inventory_count: Annotated[int, Field(ge=0)]
    excluded_inventory_count: Annotated[int, Field(ge=0)]
    exclusions: list[BreedingInventoryExclusion]
    expanded_species_nodes: Annotated[int, Field(ge=0)]
    expanded_assignment_nodes: Annotated[int, Field(ge=0)]
    expanded_nodes: Annotated[int, Field(ge=0)]
    pruned_species_routes: Annotated[int, Field(ge=0)]
    pruned_assignment_states: Annotated[int, Field(ge=0)]
    pruned_duplicate_routes: Annotated[int, Field(ge=0)]
    candidate_routes_evaluated: Annotated[int, Field(ge=0)]
    search_complete: bool
    returned_all_legal_routes: bool
    hit_limits: Annotated[list[BreedingSearchLimit], AfterValidator(_ensure_unique)]


class BreedingEngineResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_pal_id: BreedingEngineStableId
    desired_passive_ids: Annotated[
        list[BreedingEngineStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    inventory_snapshot_id: UUID
    game_data_version_id: UUID
    game_data_content_hash: BreedingSha256
    algorithm_version: BreedingEngineVersion
    scoring_profile_version: BreedingEngineVersion
    optimization_mode: OptimizationMode
    routes: list[BreedingRouteCandidate]
    mode_rankings: Annotated[list[BreedingModeRanking], Field(min_length=4), Field(max_length=4)]
    explanation_codes: Annotated[
        list[Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]],
        AfterValidator(_ensure_unique),
    ]
    diagnostics: BreedingSearchDiagnostics
    result_digest: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]


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


class CanonicalPalSourceMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_internal_name: Annotated[str, Field(min_length=1), Field(max_length=120)]
    source_passive_skill_internal_names: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=120)]],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]


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
    metadata: CanonicalPalSourceMetadata | None = None


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
    metadata: CanonicalPalSourceMetadata | None = None
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
    world_id: UUID
    player_id: UUID
    guild_id: UUID | None
    target_pal_id: StableId
    desired_passive_ids: Annotated[
        list[StableId],
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
    breeding_source_provenance: BreedingSourceProvenance | None = None
    source_provenance: SourceProvenance | None = None


class BreedingRecipeSourceDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_version: BreedingSourceVersion
    base_content_hash: BreedingSha256
    game_build_id: BreedingSourceVersion
    game_version: BreedingSourceVersion
    recipes: list[BreedingRecipeSourceRecord]


class BreedingEngineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_pal_id: BreedingEngineStableId
    desired_passive_ids: Annotated[
        list[BreedingEngineStableId],
        Field(min_length=0),
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    world_id: UUID
    inventory_snapshot_id: UUID
    game_data_version_id: UUID
    game_data_content_hash: BreedingSha256
    algorithm_version: BreedingEngineVersion
    scoring_profile_version: BreedingEngineVersion
    optimization_mode: OptimizationMode
    requester_player_id: UUID
    requester_guild_id: UUID | None
    allow_shared_inventory: bool
    allow_locked_reuse: bool
    inventory: list[BreedingEngineInventoryPal]
    limits: BreedingSearchLimits


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
