/* Generated from phase6-breeder.schema.json. Do not edit directly. */

export type BreederStableId = string;
export type BreederOptimizationMode = "balanced" | "fastest" | "highest_success" | "least_borrowing";
export type BreederJobStatus =
  | "pending"
  | "processing"
  | "algorithm_completed"
  | "ai_enriching"
  | "retry_pending"
  | "completed"
  | "failed"
  | "cancelled";
export type BreederSha256 = string;
export type BreederFormContextRpcResult = BreederFormContextRpcSuccess | BreederFormContextRpcFailure;
export type BreederDifficulty = "low" | "medium" | "high";
export type AIProviderName = "openai_compatible" | "codex_cli" | "template";
export type BreedingJobDetailRpcResult = BreedingJobDetailRpcSuccess | BreedingJobDetailRpcFailure;

export interface CreateBreedingJobRequestContracts {
  CreateBreedingJobRequest: CreateBreedingJobRequest;
  CreateBreedingJobResponse: CreateBreedingJobResponse;
  BreederCatalogPalOption: BreederCatalogPalOption;
  BreederPassiveOption: BreederPassiveOption;
  BreederFormContext: BreederFormContext;
  BreederFormContextRpcSuccess: BreederFormContextRpcSuccess;
  BreederFormContextRpcFailure: BreederFormContextRpcFailure;
  BreederFormContextRpcResult: BreederFormContextRpcResult;
  JobProgress: JobProgress;
  RouteRawScoreMetrics: RouteRawScoreMetrics;
  RouteScoreComponent: RouteScoreComponent;
  RouteModeScore: RouteModeScore;
  RouteScoreBreakdown: RouteScoreBreakdown;
  BreedingRouteViewParent: BreedingRouteViewParent;
  BreedingRouteViewStep: BreedingRouteViewStep;
  BreedingMissingRequirementView: BreedingMissingRequirementView;
  BreedingPassiveSourceView: BreedingPassiveSourceView;
  AIExplanation: AIExplanation;
  AIExplanationRouteSummary: AIExplanationRouteSummary;
  AIExplanationRequest: AIExplanationRequest;
  AIRouteExplanation: AIRouteExplanation;
  AIExplanationResult: AIExplanationResult;
  BreedingRoute: BreedingRoute;
  BreedingPlan: BreedingPlan;
  RouteComparison: RouteComparison;
  BreedingError: BreedingError;
  BreedingJobDetailRpcSuccess: BreedingJobDetailRpcSuccess;
  BreedingJobDetailRpcFailure: BreedingJobDetailRpcFailure;
  BreedingJobDetailRpcResult: BreedingJobDetailRpcResult;
}
/**
 * Phase 6 browser, Worker explanation, and route-comparison contracts.
 */
export interface CreateBreedingJobRequest {
  target_pal_id: BreederStableId;
  /**
   * @minItems 0
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  optimization_mode: BreederOptimizationMode;
  allow_guild_shared: boolean;
  max_generations: number;
}
export interface CreateBreedingJobResponse {
  job_id: string;
  reused: boolean;
  status: BreederJobStatus;
}
export interface BreederCatalogPalOption {
  pal_id: BreederStableId;
  encyclopedia_no: number | null;
  display_name: string;
  /**
   * @minItems 1
   */
  element_types: [string, ...string[]];
}
export interface BreederPassiveOption {
  passive_skill_id: BreederStableId;
  display_name: string;
  effect_text: string | null;
  rank: number;
  is_negative: boolean;
}
export interface BreederFormContext {
  data_state: "healthy" | "stale" | "parse_error";
  inventory_snapshot_id: string;
  game_data_version_id: string;
  game_data_content_hash: BreederSha256;
  game_build_id: string;
  game_version: string;
  algorithm_version: string;
  scoring_profile_versions: {
    balanced: string;
    fastest: string;
    highest_success: string;
    least_borrowing: string;
  };
  pals: BreederCatalogPalOption[];
  passive_skills: BreederPassiveOption[];
}
export interface BreederFormContextRpcSuccess {
  ok: true;
  data: BreederFormContext;
}
export interface BreederFormContextRpcFailure {
  ok: false;
  error_code: string;
}
export interface JobProgress {
  status: BreederJobStatus;
  attempt_count: number;
  error_code: string | null;
}
/**
 * Browser projection for immutable v2 history and current v3 routes; acquisition fields are absent from v2 payloads.
 */
export interface RouteRawScoreMetrics {
  generation_count: number;
  step_count: number;
  unique_starting_instance_count: number;
  starting_requirement_count?: number;
  missing_pal_count?: number;
  missing_passive_requirement_count?: number;
  missing_passive_count?: number;
  borrowed_pal_count: number;
  inventory_coverage: number;
  inventory_passive_coverage?: number;
  passive_carrier_count: number;
  passive_concentration: number;
  extra_passive_count: number;
  intermediate_pal_count: number;
  intermediate_passive_checkpoint_count: number;
  required_gender_checkpoint_count: number;
  estimated_attempts_min: number;
  estimated_attempts_max: number;
  difficulty: BreederDifficulty;
}
export interface RouteScoreComponent {
  component:
    | "route_length"
    | "inventory_coverage"
    | "passive_concentration"
    | "borrowing"
    | "intermediate_cost"
    | "attempt_cost"
    | "stability"
    | "acquisition_cost";
  raw_value: number;
  normalized_score: number;
  weight: number;
  weighted_score: number;
}
/**
 * Browser projection accepts the seven v2 components and the eight v3 components; the engine contract remains version-strict.
 */
export interface RouteModeScore {
  optimization_mode: BreederOptimizationMode;
  scoring_profile_version: string;
  total_score: number;
  /**
   * @minItems 7
   * @maxItems 8
   */
  components:
    | [
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent
      ]
    | [
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent,
        RouteScoreComponent
      ];
}
export interface RouteScoreBreakdown {
  scoring_profile_version: string;
  estimate_basis: "strategy_heuristic_no_verified_probability";
  raw_metrics: RouteRawScoreMetrics;
  /**
   * @minItems 4
   * @maxItems 4
   */
  mode_scores: [RouteModeScore, RouteModeScore, RouteModeScore, RouteModeScore];
}
export interface BreedingRouteViewParent {
  source_type: "inventory" | "intermediate" | "missing";
  pal_id: BreederStableId;
  instance_uid: string | null;
  owner_display_name: string;
  gender: ("male" | "female" | "genderless" | "unknown") | null;
  /**
   * @maxItems 64
   */
  passive_skill_ids: BreederStableId[];
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  borrowed: boolean;
  produced_by_step_index: number | null;
  location_type:
    | ("player_party" | "player_storage" | "base" | "dimensional_storage" | "viewing_cage" | "unknown")
    | null;
  location_name: string | null;
  location_slot_index: number | null;
}
export interface BreedingRouteViewStep {
  step_index: number;
  generation: number;
  recipe_type: "normal" | "special";
  parent_a: BreedingRouteViewParent;
  parent_b: BreedingRouteViewParent;
  child_pal_id: BreederStableId;
  child_required_gender: ("male" | "female") | null;
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
}
export interface BreedingMissingRequirementView {
  pal_id: BreederStableId;
  gender: "male" | "female";
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  quantity: number;
  /**
   * @minItems 1
   */
  step_indexes: [number, ...number[]];
}
export interface BreedingPassiveSourceView {
  passive_id: BreederStableId;
  source_instance_uid: string;
  source_pal_id: BreederStableId;
  first_required_step_index: number;
}
export interface AIExplanation {
  provider: AIProviderName;
  model: string | null;
  explanation: string | null;
  degraded: boolean;
}
export interface AIExplanationRouteSummary {
  route_key: BreederSha256;
  rank: number;
  total_score: number;
  generation_count: number;
  borrowed_pal_count: number;
  inventory_coverage: number;
  difficulty: BreederDifficulty;
  /**
   * @maxItems 64
   */
  pal_sequence: BreederStableId[];
  score_breakdown: RouteScoreBreakdown;
}
export interface AIExplanationRequest {
  locale: "zh-CN" | "en-US";
  target_pal_id: BreederStableId;
  /**
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  optimization_mode: BreederOptimizationMode;
  version_summary: {
    game_data_content_hash: BreederSha256;
    algorithm_version: string;
    scoring_profile_version: string;
  };
  /**
   * @maxItems 3
   */
  routes:
    | []
    | [AIExplanationRouteSummary]
    | [AIExplanationRouteSummary, AIExplanationRouteSummary]
    | [AIExplanationRouteSummary, AIExplanationRouteSummary, AIExplanationRouteSummary];
}
export interface AIRouteExplanation {
  route_key: BreederSha256;
  explanation: string;
  /**
   * @maxItems 6
   */
  labels:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string];
}
export interface AIExplanationResult {
  provider: AIProviderName;
  model: string | null;
  degraded: boolean;
  explanation: string;
  /**
   * @maxItems 3
   */
  route_explanations:
    | []
    | [AIRouteExplanation]
    | [AIRouteExplanation, AIRouteExplanation]
    | [AIRouteExplanation, AIRouteExplanation, AIRouteExplanation];
}
export interface BreedingRoute {
  route_id: string;
  saved_plan_at: string | null;
  route_key: BreederSha256;
  rank: number;
  optimization_mode: BreederOptimizationMode;
  total_score: number;
  generation_count: number;
  step_count: number;
  estimated_attempts_min: number;
  estimated_attempts_max: number;
  difficulty: BreederDifficulty;
  borrowed_pal_count: number;
  inventory_coverage: number;
  inventory_passive_coverage: number;
  inheritance_score: number;
  feasibility_status: "ready" | "needs_inventory";
  adoptable: boolean;
  missing_pal_count: number;
  /**
   * @maxItems 4
   */
  missing_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  missing_requirements: BreedingMissingRequirementView[];
  /**
   * @maxItems 4
   */
  passive_sources:
    | []
    | [BreedingPassiveSourceView]
    | [BreedingPassiveSourceView, BreedingPassiveSourceView]
    | [BreedingPassiveSourceView, BreedingPassiveSourceView, BreedingPassiveSourceView]
    | [BreedingPassiveSourceView, BreedingPassiveSourceView, BreedingPassiveSourceView, BreedingPassiveSourceView];
  existing_target_instance_uid: string | null;
  score_breakdown: RouteScoreBreakdown;
  steps: BreedingRouteViewStep[];
  ai_explanation: string | null;
  /**
   * @maxItems 6
   */
  ai_labels:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string];
}
export interface BreedingPlan {
  plan_id: string;
  result_digest: BreederSha256;
  route_count: number;
  /**
   * @maxItems 4
   */
  missing_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  explanation_codes: string[];
  diagnostics: {
    [k: string]: unknown;
  };
  ai: AIExplanation;
  /**
   * @maxItems 3
   */
  routes: [] | [BreedingRoute] | [BreedingRoute, BreedingRoute] | [BreedingRoute, BreedingRoute, BreedingRoute];
}
export interface RouteComparison {
  job_id: string;
  progress: JobProgress;
  target_pal_id: BreederStableId;
  /**
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [BreederStableId]
    | [BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId]
    | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
  optimization_mode: BreederOptimizationMode;
  allow_guild_shared: boolean;
  max_generations: number;
  inventory_snapshot_id: string;
  game_data_version_id: string;
  game_data_content_hash: BreederSha256;
  algorithm_version: string;
  scoring_profile_version: string;
  localization: BreederRouteLocalization;
  created_at: string;
  completed_at: string | null;
  plan: BreedingPlan | null;
}
export interface BreederRouteLocalization {
  locale: string;
  pals: BreederPalLocalization[];
  passive_skills: BreederPassiveLocalization[];
}
export interface BreederPalLocalization {
  pal_id: BreederStableId;
  display_name: string;
}
export interface BreederPassiveLocalization {
  passive_skill_id: BreederStableId;
  display_name: string;
  rank: number;
  is_negative: boolean;
}
export interface BreedingError {
  error_code: string;
}
export interface BreedingJobDetailRpcSuccess {
  ok: true;
  data: {
    job_id: string;
    status: BreederJobStatus;
    target_pal_id: BreederStableId;
    /**
     * @maxItems 4
     */
    desired_passive_ids:
      | []
      | [BreederStableId]
      | [BreederStableId, BreederStableId]
      | [BreederStableId, BreederStableId, BreederStableId]
      | [BreederStableId, BreederStableId, BreederStableId, BreederStableId];
    optimization_mode: BreederOptimizationMode;
    allow_guild_shared: boolean;
    max_generations: number;
    inventory_snapshot_id: string;
    game_data_version_id: string;
    game_data_content_hash: BreederSha256;
    algorithm_version: string;
    scoring_profile_version: string;
    localization: BreederRouteLocalization;
    attempt_count: number;
    error_code: string | null;
    created_at: string;
    completed_at: string | null;
    plan: BreedingPlan | null;
  };
}
export interface BreedingJobDetailRpcFailure {
  ok: false;
  error_code: string;
}
