/* Generated from breeding-engine.schema.json. Do not edit directly. */

export type BreedingEngineStableId = string;
export type BreedingSha256 = string;
export type BreedingEngineVersion = string;
export type OptimizationMode = "balanced" | "fastest" | "highest_success" | "least_borrowing";
export type BreedingEngineInstanceUid = string;
export type BreedingEngineGender = "male" | "female" | "genderless" | "unknown";
export type BreedingEngineLocationType = "player_party" | "player_storage" | "base" | "viewing_cage" | "unknown";
export type BreedingInventoryExclusionReason =
  | "disappeared"
  | "disabled"
  | "unresolved"
  | "locked"
  | "shared_inventory_disabled"
  | "different_guild"
  | "share_disabled";
export type BreedingSourceType = "inventory" | "intermediate" | "missing";
export type BreedingRequiredGender = "male" | "female";
export type BreedingDifficulty = "low" | "medium" | "high";
export type BreedingScoreComponentName =
  | "route_length"
  | "inventory_coverage"
  | "passive_concentration"
  | "borrowing"
  | "intermediate_cost"
  | "attempt_cost"
  | "stability"
  | "acquisition_cost";
export type BreedingRouteCandidate = {
  [k: string]: unknown;
} & {
  route_key: string;
  rank: number;
  optimization_mode: OptimizationMode;
  total_score: number;
  generation_count: number;
  step_count: number;
  estimated_attempts_min: number;
  estimated_attempts_max: number;
  difficulty: BreedingDifficulty;
  borrowed_pal_count: number;
  inventory_coverage: number;
  inventory_passive_coverage: number;
  inheritance_score: number;
  feasibility_status: BreedingFeasibilityStatus;
  adoptable: boolean;
  missing_pal_count: number;
  /**
   * @maxItems 4
   */
  missing_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
  missing_requirements: BreedingMissingRequirement[];
  /**
   * @maxItems 4
   */
  passive_sources:
    | []
    | [BreedingPassiveSource]
    | [BreedingPassiveSource, BreedingPassiveSource]
    | [BreedingPassiveSource, BreedingPassiveSource, BreedingPassiveSource]
    | [BreedingPassiveSource, BreedingPassiveSource, BreedingPassiveSource, BreedingPassiveSource];
  existing_target_instance_uid: BreedingEngineInstanceUid | null;
  score_breakdown: BreedingScoreBreakdown;
  steps: BreedingRouteStep[];
};
export type BreedingFeasibilityStatus = "ready" | "needs_inventory";
export type BreedingSearchLimit =
  | "max_expanded_nodes"
  | "timeout"
  | "species_route_cap"
  | "assignment_state_cap"
  | "candidate_cap";

export interface BreedingEngineRequestContracts {
  BreedingEngineRequest: BreedingEngineRequest;
  BreedingSearchLimits: BreedingSearchLimits;
  BreedingEngineInventoryPal: BreedingEngineInventoryPal;
  BreedingInventoryExclusion: BreedingInventoryExclusion;
  BreedingParentSource: BreedingParentSource;
  BreedingRouteStep: BreedingRouteStep;
  BreedingMissingRequirement: BreedingMissingRequirement;
  BreedingPassiveSource: BreedingPassiveSource;
  BreedingRawScoreMetrics: BreedingRawScoreMetrics;
  BreedingScoreComponent: BreedingScoreComponent;
  BreedingModeScore: BreedingModeScore;
  BreedingScoreBreakdown: BreedingScoreBreakdown;
  BreedingRouteCandidate: BreedingRouteCandidate;
  BreedingModeRanking: BreedingModeRanking;
  BreedingSearchDiagnostics: BreedingSearchDiagnostics;
  BreedingEngineResult: BreedingEngineResult;
}
/**
 * Version-fixed deterministic breeding search input and result contracts.
 */
export interface BreedingEngineRequest {
  target_pal_id: BreedingEngineStableId;
  /**
   * @minItems 0
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
  world_id: string;
  inventory_snapshot_id: string;
  game_data_version_id: string;
  game_data_content_hash: BreedingSha256;
  algorithm_version: BreedingEngineVersion;
  scoring_profile_version: BreedingEngineVersion;
  optimization_mode: OptimizationMode;
  requester_player_id: string;
  requester_guild_id: string | null;
  allow_shared_inventory: boolean;
  allow_locked_reuse: boolean;
  inventory: BreedingEngineInventoryPal[];
  limits: BreedingSearchLimits;
}
export interface BreedingEngineInventoryPal {
  instance_uid: BreedingEngineInstanceUid;
  pal_id: BreedingEngineStableId;
  owner_player_id: string | null;
  guild_id: string | null;
  gender: BreedingEngineGender;
  /**
   * @maxItems 64
   */
  passive_skill_ids: BreedingEngineStableId[];
  location_type: BreedingEngineLocationType;
  location_name: string | null;
  share_enabled: boolean;
  owner_resolved: boolean;
  guild_resolved: boolean;
  present_in_snapshot: boolean;
  breeding_enabled: boolean;
  plan_locked: boolean;
}
export interface BreedingSearchLimits {
  max_generations: number;
  max_expanded_nodes: number;
  timeout_ms: number;
  max_species_routes_per_pal: number;
  max_assignment_states_per_mask: number;
  max_candidate_routes: number;
  max_results: number;
}
export interface BreedingInventoryExclusion {
  reason: BreedingInventoryExclusionReason;
  count: number;
}
export interface BreedingParentSource {
  source_type: BreedingSourceType;
  pal_id: BreedingEngineStableId;
  instance_uid: BreedingEngineInstanceUid | null;
  owner_player_id: string | null;
  guild_id: string | null;
  gender: BreedingEngineGender | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: BreedingEngineStableId[];
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
  borrowed: boolean;
  produced_by_step_index: number | null;
  location_type: BreedingEngineLocationType | null;
  location_name: string | null;
}
export interface BreedingRouteStep {
  step_index: number;
  generation: number;
  recipe_type: "normal" | "special";
  parent_a: BreedingParentSource;
  parent_b: BreedingParentSource;
  child_pal_id: BreedingEngineStableId;
  child_required_gender: BreedingRequiredGender | null;
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
}
export interface BreedingMissingRequirement {
  pal_id: BreedingEngineStableId;
  gender: BreedingRequiredGender;
  /**
   * @maxItems 0
   */
  required_passive_ids: [];
  quantity: number;
  /**
   * @minItems 1
   */
  step_indexes: [number, ...number[]];
}
export interface BreedingPassiveSource {
  passive_id: BreedingEngineStableId;
  source_instance_uid: BreedingEngineInstanceUid;
  source_pal_id: BreedingEngineStableId;
  first_required_step_index: number;
}
export interface BreedingRawScoreMetrics {
  generation_count: number;
  step_count: number;
  unique_starting_instance_count: number;
  starting_requirement_count: number;
  missing_pal_count: number;
  missing_passive_requirement_count: number;
  missing_passive_count: number;
  borrowed_pal_count: number;
  inventory_coverage: number;
  inventory_passive_coverage: number;
  passive_carrier_count: number;
  passive_concentration: number;
  extra_passive_count: number;
  intermediate_pal_count: number;
  intermediate_passive_checkpoint_count: number;
  required_gender_checkpoint_count: number;
  estimated_attempts_min: number;
  estimated_attempts_max: number;
  difficulty: BreedingDifficulty;
}
export interface BreedingScoreComponent {
  component: BreedingScoreComponentName;
  raw_value: number;
  normalized_score: number;
  weight: number;
  weighted_score: number;
}
export interface BreedingModeScore {
  optimization_mode: OptimizationMode;
  scoring_profile_version: BreedingEngineVersion;
  total_score: number;
  /**
   * @minItems 8
   * @maxItems 8
   */
  components: [
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent,
    BreedingScoreComponent
  ];
}
export interface BreedingScoreBreakdown {
  scoring_profile_version: BreedingEngineVersion;
  estimate_basis: "strategy_heuristic_no_verified_probability";
  raw_metrics: BreedingRawScoreMetrics;
  /**
   * @minItems 4
   * @maxItems 4
   */
  mode_scores: [BreedingModeScore, BreedingModeScore, BreedingModeScore, BreedingModeScore];
}
export interface BreedingModeRanking {
  optimization_mode: OptimizationMode;
  scoring_profile_version: BreedingEngineVersion;
  route_keys: string[];
}
export interface BreedingSearchDiagnostics {
  graph_pal_count: number;
  effective_recipe_count: number;
  inventory_input_count: number;
  eligible_inventory_count: number;
  excluded_inventory_count: number;
  exclusions: BreedingInventoryExclusion[];
  expanded_species_nodes: number;
  expanded_assignment_nodes: number;
  expanded_nodes: number;
  pruned_species_routes: number;
  pruned_assignment_states: number;
  pruned_duplicate_routes: number;
  candidate_routes_evaluated: number;
  search_complete: boolean;
  returned_all_legal_routes: boolean;
  hit_limits: BreedingSearchLimit[];
}
export interface BreedingEngineResult {
  target_pal_id: BreedingEngineStableId;
  /**
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
  inventory_snapshot_id: string;
  game_data_version_id: string;
  game_data_content_hash: BreedingSha256;
  algorithm_version: BreedingEngineVersion;
  scoring_profile_version: BreedingEngineVersion;
  optimization_mode: OptimizationMode;
  /**
   * @maxItems 4
   */
  missing_passive_ids:
    | []
    | [BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId]
    | [BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId, BreedingEngineStableId];
  routes: BreedingRouteCandidate[];
  /**
   * @minItems 4
   * @maxItems 4
   */
  mode_rankings: [BreedingModeRanking, BreedingModeRanking, BreedingModeRanking, BreedingModeRanking];
  explanation_codes: string[];
  diagnostics: BreedingSearchDiagnostics;
  result_digest: string;
}
