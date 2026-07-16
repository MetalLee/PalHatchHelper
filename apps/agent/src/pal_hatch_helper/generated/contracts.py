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
    rank: int
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
    parent_a_gender: Literal["any", "female", "male"] = "any"
    parent_b_pal_id: StableId
    parent_b_gender: Literal["any", "female", "male"] = "any"
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


class BreedingParentGender(StrEnum):
    ANY = "any"
    FEMALE = "female"
    MALE = "male"


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
    parent_a_gender: BreedingParentGender
    parent_b_pal_id: BreedingStableId
    parent_b_gender: BreedingParentGender
    child_pal_id: BreedingStableId
    recipe_type: BreedingRecipeType
    metadata: BreedingMetadata


class BreedingRecipeChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    parent_a_pal_id: BreedingStableId
    parent_a_gender: BreedingParentGender
    parent_b_pal_id: BreedingStableId
    parent_b_gender: BreedingParentGender
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


type BreederStableId = Annotated[
    str,
    Field(min_length=1),
    Field(max_length=120),
    Field(pattern="^[a-z0-9][a-z0-9._-]*$"),
]


type BreederSha256 = Annotated[str, Field(pattern="^[0-9a-f]{64}$")]


class BreederOptimizationMode(StrEnum):
    BALANCED = "balanced"
    FASTEST = "fastest"
    HIGHEST_SUCCESS = "highest_success"
    LEAST_BORROWING = "least_borrowing"


class BreederJobStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    ALGORITHM_COMPLETED = "algorithm_completed"
    AI_ENRICHING = "ai_enriching"
    RETRY_PENDING = "retry_pending"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BreederDifficulty(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AIProviderName(StrEnum):
    OPENAI_COMPATIBLE = "openai_compatible"
    CODEX_CLI = "codex_cli"
    TEMPLATE = "template"


class CreateBreedingJobResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: UUID
    reused: bool
    status: BreederJobStatus


class BreederCatalogPalOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pal_id: BreederStableId
    encyclopedia_no: Annotated[int, Field(ge=1)] | None
    display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    element_types: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=80)]],
        Field(min_length=1),
        AfterValidator(_ensure_unique),
    ]


class BreederPassiveOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    passive_skill_id: BreederStableId
    display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    rank: int
    is_negative: bool


class BreederFormContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_state: Literal["healthy", "stale", "parse_error"]
    inventory_snapshot_id: UUID
    game_data_version_id: UUID
    game_data_content_hash: BreederSha256
    game_build_id: Annotated[str, Field(min_length=1), Field(max_length=80)]
    game_version: Annotated[str, Field(min_length=1), Field(max_length=80)]
    algorithm_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    scoring_profile_versions: dict[str, object]
    pals: list[BreederCatalogPalOption]
    passive_skills: list[BreederPassiveOption]


class BreederFormContextRpcSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True]
    data: BreederFormContext


class BreederFormContextRpcFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[False]
    error_code: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]


type BreederFormContextRpcResult = BreederFormContextRpcSuccess | BreederFormContextRpcFailure


class JobProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: BreederJobStatus
    attempt_count: Annotated[int, Field(ge=0)]
    error_code: Annotated[str, Field(max_length=100), Field(pattern="^[A-Z][A-Z0-9_]*$")] | None


class RouteRawScoreMetrics(BaseModel):
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
    difficulty: BreederDifficulty


class RouteScoreComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component: Literal[
        "route_length",
        "inventory_coverage",
        "passive_concentration",
        "borrowing",
        "intermediate_cost",
        "attempt_cost",
        "stability",
    ]
    raw_value: Annotated[float, Field(ge=0)]
    normalized_score: Annotated[float, Field(ge=0), Field(le=100)]
    weight: Annotated[float, Field(ge=0), Field(le=1)]
    weighted_score: Annotated[float, Field(ge=0), Field(le=100)]


class RouteModeScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    optimization_mode: BreederOptimizationMode
    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    total_score: Annotated[float, Field(ge=0), Field(le=100)]
    components: Annotated[list[RouteScoreComponent], Field(min_length=7), Field(max_length=7)]


class RouteScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    estimate_basis: Literal["strategy_heuristic_no_verified_probability"]
    raw_metrics: RouteRawScoreMetrics
    mode_scores: Annotated[list[RouteModeScore], Field(min_length=4), Field(max_length=4)]


class BreedingRouteViewParent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: Literal["inventory", "intermediate"]
    pal_id: BreederStableId
    instance_uid: Annotated[str, Field(max_length=160)] | None
    owner_display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    gender: Literal["male", "female", "genderless", "unknown"] | None
    passive_skill_ids: Annotated[
        list[BreederStableId],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    required_passive_ids: Annotated[
        list[BreederStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    borrowed: bool
    produced_by_step_index: Annotated[int, Field(ge=0)] | None
    location_type: (
        Literal[
            "player_party",
            "player_storage",
            "base",
            "viewing_cage",
            "unknown",
        ]
        | None
    )
    location_name: Annotated[str, Field(max_length=160)] | None


class BreedingRouteViewStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_index: Annotated[int, Field(ge=0)]
    generation: Annotated[int, Field(ge=1), Field(le=8)]
    recipe_type: Literal["normal", "special"]
    parent_a: BreedingRouteViewParent
    parent_b: BreedingRouteViewParent
    child_pal_id: BreederStableId
    child_required_gender: Literal["male", "female"] | None
    required_passive_ids: Annotated[
        list[BreederStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]


class AIExplanation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: AIProviderName
    model: Annotated[str, Field(max_length=120)] | None
    explanation: Annotated[str, Field(max_length=10000)] | None
    degraded: bool


class AIExplanationRouteSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route_key: BreederSha256
    rank: Annotated[int, Field(ge=1), Field(le=3)]
    total_score: Annotated[float, Field(ge=0), Field(le=100)]
    generation_count: Annotated[int, Field(ge=0), Field(le=8)]
    borrowed_pal_count: Annotated[int, Field(ge=0)]
    inventory_coverage: Annotated[float, Field(ge=0), Field(le=1)]
    difficulty: BreederDifficulty
    pal_sequence: Annotated[
        list[BreederStableId],
        Field(max_length=64),
        AfterValidator(_ensure_unique),
    ]
    score_breakdown: RouteScoreBreakdown


class AIExplanationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_pal_id: BreederStableId
    desired_passive_ids: Annotated[
        list[BreederStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    optimization_mode: BreederOptimizationMode
    version_summary: dict[str, object]
    routes: Annotated[list[AIExplanationRouteSummary], Field(max_length=3)]


class AIRouteExplanation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route_key: BreederSha256
    explanation: Annotated[str, Field(min_length=1), Field(max_length=4000)]
    labels: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=80)]],
        Field(max_length=6),
    ]


class AIExplanationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: AIProviderName
    model: Annotated[str, Field(max_length=120)] | None
    degraded: bool
    explanation: Annotated[str, Field(min_length=1), Field(max_length=10000)]
    route_explanations: Annotated[list[AIRouteExplanation], Field(max_length=3)]


class BreedingRoute(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route_id: UUID
    execution_plan_id: UUID | None
    route_key: BreederSha256
    rank: Annotated[int, Field(ge=1), Field(le=3)]
    optimization_mode: BreederOptimizationMode
    total_score: Annotated[float, Field(ge=0), Field(le=100)]
    generation_count: Annotated[int, Field(ge=0), Field(le=8)]
    step_count: Annotated[int, Field(ge=0)]
    estimated_attempts_min: Annotated[int, Field(ge=0)]
    estimated_attempts_max: Annotated[int, Field(ge=0)]
    difficulty: BreederDifficulty
    borrowed_pal_count: Annotated[int, Field(ge=0)]
    inventory_coverage: Annotated[float, Field(ge=0), Field(le=1)]
    inheritance_score: Annotated[float, Field(ge=0), Field(le=1)]
    existing_target_instance_uid: Annotated[str, Field(max_length=160)] | None
    score_breakdown: RouteScoreBreakdown
    steps: list[BreedingRouteViewStep]
    ai_explanation: Annotated[str, Field(max_length=4000)] | None
    ai_labels: Annotated[list[Annotated[str, Field(max_length=80)]], Field(max_length=6)]


class BreedingPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: UUID
    result_digest: BreederSha256
    route_count: Annotated[int, Field(ge=0), Field(le=3)]
    explanation_codes: Annotated[
        list[Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]],
        AfterValidator(_ensure_unique),
    ]
    diagnostics: dict[str, object]
    ai: AIExplanation
    routes: Annotated[list[BreedingRoute], Field(max_length=3)]


class RouteComparison(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_id: UUID
    progress: JobProgress
    target_pal_id: BreederStableId
    desired_passive_ids: Annotated[
        list[BreederStableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    optimization_mode: BreederOptimizationMode
    allow_guild_shared: bool
    max_generations: Annotated[int, Field(ge=1), Field(le=8)]
    inventory_snapshot_id: UUID
    game_data_version_id: UUID
    game_data_content_hash: BreederSha256
    algorithm_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    created_at: AwareDatetime
    completed_at: AwareDatetime | None
    plan: BreedingPlan | None


class BreedingError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error_code: Annotated[
        str,
        Field(min_length=1),
        Field(max_length=100),
        Field(pattern="^[A-Z][A-Z0-9_]*$"),
    ]


class BreedingJobDetailRpcSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True]
    data: dict[str, object]


class BreedingJobDetailRpcFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[False]
    error_code: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]


type BreedingJobDetailRpcResult = BreedingJobDetailRpcSuccess | BreedingJobDetailRpcFailure


type InstanceUid = Annotated[str, Field(min_length=1), Field(max_length=160)]


type IdempotencyKey = Annotated[
    str,
    Field(min_length=8),
    Field(max_length=160),
    Field(pattern="^[A-Za-z0-9._:-]+$"),
]


class PlanStatus(StrEnum):
    ACTIVE = "active"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    PAUSED = "paused"
    COMPLETED = "completed"
    INVALIDATED = "invalidated"
    CANCELLED = "cancelled"


class PlanStepStatus(StrEnum):
    NOT_STARTED = "not_started"
    BREEDING = "breeding"
    CANDIDATE_DETECTED = "candidate_detected"
    COMPLETED = "completed"
    RETRYING = "retrying"
    SKIPPED = "skipped"
    INVALIDATED = "invalidated"


class Phase7ErrorCode(StrEnum):
    ROUTE_NOT_ADOPTABLE = "ROUTE_NOT_ADOPTABLE"
    PLAN_NOT_FOUND = "PLAN_NOT_FOUND"
    PLAN_ACCESS_DENIED = "PLAN_ACCESS_DENIED"
    PLAN_VERSION_CONFLICT = "PLAN_VERSION_CONFLICT"
    PLAN_INVALID_STATE_TRANSITION = "PLAN_INVALID_STATE_TRANSITION"
    PLAN_NOT_CURRENT_STEP = "PLAN_NOT_CURRENT_STEP"
    PLAN_PAUSED = "PLAN_PAUSED"
    STEP_PREREQUISITE_INCOMPLETE = "STEP_PREREQUISITE_INCOMPLETE"
    CANDIDATE_NOT_FOUND = "CANDIDATE_NOT_FOUND"
    CANDIDATE_ALREADY_USED = "CANDIDATE_ALREADY_USED"
    CANDIDATE_SPECIES_MISMATCH = "CANDIDATE_SPECIES_MISMATCH"
    CANDIDATE_CONFIRMATION_REQUIRED = "CANDIDATE_CONFIRMATION_REQUIRED"
    EXISTING_PAL_NOT_ELIGIBLE = "EXISTING_PAL_NOT_ELIGIBLE"
    PLAN_DEPENDENCY_UNAVAILABLE = "PLAN_DEPENDENCY_UNAVAILABLE"
    PLAN_RECALCULATION_REQUIRED = "PLAN_RECALCULATION_REQUIRED"
    PLAN_FIXED_VERSION_UNAVAILABLE = "PLAN_FIXED_VERSION_UNAVAILABLE"
    SNAPSHOT_DELTA_UNAVAILABLE = "SNAPSHOT_DELTA_UNAVAILABLE"


class PlanParentSourceKind(StrEnum):
    INVENTORY = "inventory"
    PRIOR_STEP = "prior_step"


class InvalidationReasonCode(StrEnum):
    DEPENDENCY_DISAPPEARED = "DEPENDENCY_DISAPPEARED"
    OWNER_CHANGED = "OWNER_CHANGED"
    SHARING_DISABLED = "SHARING_DISABLED"
    GUILD_ACCESS_LOST = "GUILD_ACCESS_LOST"
    GENDER_INCOMPATIBLE = "GENDER_INCOMPATIBLE"
    CONFIRMED_RESULT_DIVERGED = "CONFIRMED_RESULT_DIVERGED"
    FIXED_CATALOG_UNAVAILABLE = "FIXED_CATALOG_UNAVAILABLE"
    FIXED_CONTENT_HASH_MISMATCH = "FIXED_CONTENT_HASH_MISMATCH"


class InvalidationReason(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: InvalidationReasonCode
    step_index: Annotated[int, Field(ge=0)] | None
    instance_uid: InstanceUid | None
    details: dict[str, object]


class PlanVersionPin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    inventory_snapshot_id: UUID
    game_data_version_id: UUID
    content_hash: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    algorithm_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]


class PlanStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: UUID
    step_index: Annotated[int, Field(ge=0)]
    parent_a_source_kind: PlanParentSourceKind
    parent_a_instance_uid: InstanceUid | None
    parent_a_step_index: Annotated[int, Field(ge=0)] | None
    parent_b_source_kind: PlanParentSourceKind
    parent_b_instance_uid: InstanceUid | None
    parent_b_step_index: Annotated[int, Field(ge=0)] | None
    expected_child_pal_id: StableId
    required_passive_ids: Annotated[
        list[StableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    preferred_gender: Literal["male", "female"] | None
    selected_child_instance_uid: InstanceUid | None
    baseline_snapshot_id: UUID | None
    candidate_detection_started_at: AwareDatetime | None
    attempt_number: Annotated[int, Field(ge=0)]
    status: PlanStepStatus
    concurrency_version: Annotated[int, Field(ge=1)]
    skip_reason: Annotated[str, Field(max_length=500)] | None
    invalidation_reasons: list[InvalidationReason]
    completed_at: AwareDatetime | None


class CandidateMatchBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    species: Annotated[float, Field(ge=0), Field(le=1)]
    passive_overlap: Annotated[float, Field(ge=0), Field(le=1)]
    gender: Annotated[float, Field(ge=0), Field(le=1)]
    accessibility: Annotated[float, Field(ge=0), Field(le=1)]
    first_appearance: Annotated[float, Field(ge=0), Field(le=1)]


class OffspringCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_key: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    step_id: UUID
    pal_instance_uid: InstanceUid
    detected_snapshot_id: UUID
    pal_id: StableId
    pal_display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    species_match: bool
    matched_passive_ids: Annotated[
        list[StableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    required_passive_count: Annotated[int, Field(ge=0), Field(le=4)]
    gender: PalGender
    level: Annotated[int, Field(ge=1), Field(le=100)] | None
    owner_display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    location_type: PalLocationType
    location_name: Annotated[str, Field(max_length=160)] | None
    accessible: bool
    match_score: Annotated[float, Field(ge=0), Field(le=1)]
    match_breakdown: CandidateMatchBreakdown
    first_detected_at: AwareDatetime
    confirmed: bool
    rejected_at: AwareDatetime | None
    rejection_reason: Annotated[str, Field(max_length=500)] | None


class PlanEventSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: UUID
    step_id: UUID | None
    event_type: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]
    actor_kind: Literal["player", "admin", "agent", "system"]
    actor_display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    from_status: Annotated[str, Field(max_length=40)] | None
    to_status: Annotated[str, Field(max_length=40)] | None
    safe_metadata: dict[str, object]
    created_at: AwareDatetime


class PlanSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: UUID
    target_pal_id: StableId
    target_pal_display_name: Annotated[str, Field(min_length=1), Field(max_length=160)]
    desired_passive_ids: Annotated[
        list[StableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    desired_passive_display_names: Annotated[
        list[Annotated[str, Field(min_length=1), Field(max_length=160)]],
        Field(max_length=4),
    ]
    status: PlanStatus
    current_step_index: Annotated[int, Field(ge=0)]
    completed_step_count: Annotated[int, Field(ge=0)]
    total_step_count: Annotated[int, Field(ge=0)]
    pending_candidate_count: Annotated[int, Field(ge=0)]
    version_pin: PlanVersionPin
    concurrency_version: Annotated[int, Field(ge=1)]
    created_at: AwareDatetime
    updated_at: AwareDatetime


class PlanDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: PlanSummary
    adopted_route_id: UUID
    invalidation_reasons: list[InvalidationReason]
    steps: list[PlanStep]
    candidates: list[OffspringCandidate]
    events: list[PlanEventSummary]


type AdoptRouteRequest = AdoptRouteRequestBody


class AdoptRouteRequestBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    route_id: UUID
    idempotency_key: IdempotencyKey


class AdoptRouteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: UUID
    reused: bool
    status: PlanStatus
    concurrency_version: Annotated[int, Field(ge=1)]


class UpdateStepStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


type StartBreedingRequest = UpdateStepStatusRequest


type ContinueAttemptRequest = UpdateStepStatusRequest


type PausePlanRequest = UpdateStepStatusRequest


type ResumePlanRequest = UpdateStepStatusRequest


class SelectExistingPalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pal_instance_uid: InstanceUid
    allow_passive_mismatch: bool
    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


class ConfirmOffspringRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_key: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


class RejectCandidateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[str, Field(min_length=1), Field(max_length=500)]
    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


class SkipStepRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[str, Field(min_length=1), Field(max_length=500)]
    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


class RecalculatePlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: Annotated[str, Field(min_length=1), Field(max_length=500)]
    expected_concurrency_version: Annotated[int, Field(ge=1)]
    idempotency_key: IdempotencyKey


class OptimisticConcurrencyConflict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    error_code: Literal["PLAN_VERSION_CONFLICT"]
    expected_version: Annotated[int, Field(ge=1)]
    actual_version: Annotated[int, Field(ge=1)]


class PlanMutationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: UUID
    status: PlanStatus
    current_step_index: Annotated[int, Field(ge=0)]
    concurrency_version: Annotated[int, Field(ge=1)]


class RecalculatePlanResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_plan_id: UUID
    job_id: UUID
    reused: bool


class PlanListPage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[PlanSummary]
    next_cursor: Annotated[str, Field(max_length=500)] | None
    query_boundary: AwareDatetime


class PlanRpcFailure(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[False]
    error_code: Annotated[str, Field(pattern="^[A-Z][A-Z0-9_]*$")]


class PlanListRpcSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True]
    data: PlanListPage


type PlanListRpcResult = PlanListRpcSuccess | PlanRpcFailure


class PlanDetailRpcSuccess(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: Literal[True]
    data: PlanDetail


type PlanDetailRpcResult = PlanDetailRpcSuccess | PlanRpcFailure


class DetectionStepContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: UUID
    plan_id: UUID
    world_id: UUID
    baseline_snapshot_id: UUID
    expected_child_pal_id: StableId
    required_passive_ids: Annotated[
        list[StableId],
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    preferred_gender: Literal["male", "female"] | None


class CandidateDetectionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pal_instance_uid: InstanceUid
    match_score: Annotated[float, Field(ge=0), Field(le=1)]
    match_breakdown: CandidateMatchBreakdown


class CandidateDetectionBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: UUID
    detected_snapshot_id: UUID
    candidates: Annotated[list[CandidateDetectionWrite], Field(max_length=500)]


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
    game_data_content_hash: Annotated[str, Field(pattern="^[0-9a-f]{64}$")]
    algorithm_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    scoring_profile_version: Annotated[str, Field(min_length=1), Field(max_length=100)]
    allow_guild_shared: bool
    max_generations: Annotated[int, Field(ge=1), Field(le=8)]
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


class CreateBreedingJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_pal_id: BreederStableId
    desired_passive_ids: Annotated[
        list[BreederStableId],
        Field(min_length=0),
        Field(max_length=4),
        AfterValidator(_ensure_unique),
    ]
    optimization_mode: BreederOptimizationMode
    allow_guild_shared: bool
    max_generations: Annotated[int, Field(ge=1), Field(le=8)]
