/* Generated from phase7-execution-plans.schema.json. Do not edit directly. */

export type IdempotencyKey = string;
export type PlanStatus = "active" | "awaiting_confirmation" | "paused" | "completed" | "invalidated" | "cancelled";
export type StableId = string;
export type InvalidationReasonCode =
  | "DEPENDENCY_DISAPPEARED"
  | "OWNER_CHANGED"
  | "SHARING_DISABLED"
  | "GUILD_ACCESS_LOST"
  | "GENDER_INCOMPATIBLE"
  | "CONFIRMED_RESULT_DIVERGED"
  | "FIXED_CATALOG_UNAVAILABLE"
  | "FIXED_CONTENT_HASH_MISMATCH";
export type InstanceUid = string;
export type PlanParentSourceKind = "inventory" | "prior_step";
export type PlanStepStatus =
  | "not_started"
  | "breeding"
  | "candidate_detected"
  | "completed"
  | "retrying"
  | "skipped"
  | "invalidated";
export type PalGender = "male" | "female" | "genderless" | "unknown";
export type PalLocationType =
  | "player_party"
  | "player_storage"
  | "base"
  | "dimensional_storage"
  | "viewing_cage"
  | "unknown";
export type Phase7ErrorCode =
  | "ROUTE_NOT_ADOPTABLE"
  | "PLAN_NOT_FOUND"
  | "PLAN_ACCESS_DENIED"
  | "PLAN_VERSION_CONFLICT"
  | "PLAN_INVALID_STATE_TRANSITION"
  | "PLAN_NOT_CURRENT_STEP"
  | "PLAN_PAUSED"
  | "STEP_PREREQUISITE_INCOMPLETE"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_ALREADY_USED"
  | "CANDIDATE_SPECIES_MISMATCH"
  | "CANDIDATE_CONFIRMATION_REQUIRED"
  | "EXISTING_PAL_NOT_ELIGIBLE"
  | "PLAN_DEPENDENCY_UNAVAILABLE"
  | "PLAN_RECALCULATION_REQUIRED"
  | "PLAN_FIXED_VERSION_UNAVAILABLE"
  | "SNAPSHOT_DELTA_UNAVAILABLE";
export type PlanListRpcResult = PlanListRpcSuccess | PlanRpcFailure;
export type PlanDetailRpcResult = PlanDetailRpcSuccess | PlanRpcFailure;

export interface AdoptRouteRequestContracts {
  AdoptRouteRequest: AdoptRouteRequest;
  AdoptRouteResponse: AdoptRouteResponse;
  PlanSummary: PlanSummary;
  PlanDetail: PlanDetail;
  PlanVersionPin: PlanVersionPin;
  PlanStep: PlanStep;
  PlanStepStatus: PlanStepStatus;
  PlanStatus: PlanStatus;
  Phase7ErrorCode: Phase7ErrorCode;
  OffspringCandidate: OffspringCandidate;
  CandidateMatchBreakdown: CandidateMatchBreakdown;
  UpdateStepStatusRequest: UpdateStepStatusRequest;
  StartBreedingRequest: UpdateStepStatusRequest;
  ContinueAttemptRequest: UpdateStepStatusRequest;
  SelectExistingPalRequest: SelectExistingPalRequest;
  ConfirmOffspringRequest: ConfirmOffspringRequest;
  RejectCandidateRequest: RejectCandidateRequest;
  PausePlanRequest: UpdateStepStatusRequest;
  ResumePlanRequest: UpdateStepStatusRequest;
  SkipStepRequest: SkipStepRequest;
  RecalculatePlanRequest: RecalculatePlanRequest;
  InvalidationReason: InvalidationReason;
  PlanEventSummary: PlanEventSummary;
  OptimisticConcurrencyConflict: OptimisticConcurrencyConflict;
  PlanMutationResponse: PlanMutationResponse;
  RecalculatePlanResponse: RecalculatePlanResponse;
  PlanListPage: PlanListPage;
  PlanListRpcResult: PlanListRpcResult;
  PlanDetailRpcResult: PlanDetailRpcResult;
  DetectionStepContext: DetectionStepContext;
  CandidateDetectionWrite: CandidateDetectionWrite;
  CandidateDetectionBatchRequest: CandidateDetectionBatchRequest;
}
/**
 * Phase 7 route adoption, manual execution, candidate detection, history, and optimistic concurrency contracts.
 */
export interface AdoptRouteRequest {
  route_id: string;
  idempotency_key: IdempotencyKey;
}
export interface AdoptRouteResponse {
  plan_id: string;
  reused: boolean;
  status: PlanStatus;
  concurrency_version: number;
}
export interface PlanSummary {
  plan_id: string;
  target_pal_id: StableId;
  target_pal_display_name: string;
  /**
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [StableId]
    | [StableId, StableId]
    | [StableId, StableId, StableId]
    | [StableId, StableId, StableId, StableId];
  /**
   * @maxItems 4
   */
  desired_passive_display_names:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string];
  /**
   * @maxItems 4
   */
  desired_passives:
    | []
    | [PlanPassiveSummary]
    | [PlanPassiveSummary, PlanPassiveSummary]
    | [PlanPassiveSummary, PlanPassiveSummary, PlanPassiveSummary]
    | [PlanPassiveSummary, PlanPassiveSummary, PlanPassiveSummary, PlanPassiveSummary];
  status: PlanStatus;
  current_step_index: number;
  completed_step_count: number;
  total_step_count: number;
  pending_candidate_count: number;
  version_pin: PlanVersionPin;
  concurrency_version: number;
  created_at: string;
  updated_at: string;
}
export interface PlanPassiveSummary {
  passive_skill_id: StableId;
  display_name: string;
  rank: number;
  is_negative: boolean;
}
export interface PlanVersionPin {
  inventory_snapshot_id: string;
  game_data_version_id: string;
  content_hash: string;
  algorithm_version: string;
  scoring_profile_version: string;
}
export interface PlanDetail {
  summary: PlanSummary;
  adopted_route_id: string;
  invalidation_reasons: InvalidationReason[];
  steps: PlanStep[];
  candidates: OffspringCandidate[];
  events: PlanEventSummary[];
}
export interface InvalidationReason {
  code: InvalidationReasonCode;
  step_index: number | null;
  instance_uid: InstanceUid | null;
  details: {
    [k: string]: unknown;
  };
}
export interface PlanStep {
  step_id: string;
  step_index: number;
  parent_a_source_kind: PlanParentSourceKind;
  parent_a_instance_uid: InstanceUid | null;
  parent_a_step_index: number | null;
  parent_b_source_kind: PlanParentSourceKind;
  parent_b_instance_uid: InstanceUid | null;
  parent_b_step_index: number | null;
  expected_child_pal_id: StableId;
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [StableId]
    | [StableId, StableId]
    | [StableId, StableId, StableId]
    | [StableId, StableId, StableId, StableId];
  preferred_gender: ("male" | "female") | null;
  selected_child_instance_uid: InstanceUid | null;
  baseline_snapshot_id: string | null;
  candidate_detection_started_at: string | null;
  attempt_number: number;
  status: PlanStepStatus;
  concurrency_version: number;
  skip_reason: string | null;
  invalidation_reasons: InvalidationReason[];
  completed_at: string | null;
}
export interface OffspringCandidate {
  candidate_key: string;
  step_id: string;
  pal_instance_uid: InstanceUid;
  detected_snapshot_id: string;
  pal_id: StableId;
  pal_display_name: string;
  species_match: boolean;
  /**
   * @maxItems 4
   */
  matched_passive_ids:
    | []
    | [StableId]
    | [StableId, StableId]
    | [StableId, StableId, StableId]
    | [StableId, StableId, StableId, StableId];
  required_passive_count: number;
  gender: PalGender;
  level: number | null;
  owner_display_name: string;
  location_type: PalLocationType;
  location_name: string | null;
  accessible: boolean;
  match_score: number;
  match_breakdown: CandidateMatchBreakdown;
  first_detected_at: string;
  confirmed: boolean;
  rejected_at: string | null;
  rejection_reason: string | null;
}
export interface CandidateMatchBreakdown {
  species: number;
  passive_overlap: number;
  gender: number;
  accessibility: number;
  first_appearance: number;
}
export interface PlanEventSummary {
  event_id: string;
  step_id: string | null;
  event_type: string;
  actor_kind: "player" | "admin" | "agent" | "system";
  actor_display_name: string;
  from_status: string | null;
  to_status: string | null;
  safe_metadata: {
    [k: string]: unknown;
  };
  created_at: string;
}
export interface UpdateStepStatusRequest {
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface SelectExistingPalRequest {
  pal_instance_uid: InstanceUid;
  allow_passive_mismatch: boolean;
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface ConfirmOffspringRequest {
  candidate_key: string;
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface RejectCandidateRequest {
  reason: string;
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface SkipStepRequest {
  reason: string;
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface RecalculatePlanRequest {
  reason: string;
  expected_concurrency_version: number;
  idempotency_key: IdempotencyKey;
}
export interface OptimisticConcurrencyConflict {
  error_code: "PLAN_VERSION_CONFLICT";
  expected_version: number;
  actual_version: number;
}
export interface PlanMutationResponse {
  plan_id: string;
  status: PlanStatus;
  current_step_index: number;
  concurrency_version: number;
}
export interface RecalculatePlanResponse {
  source_plan_id: string;
  job_id: string;
  reused: boolean;
}
export interface PlanListPage {
  items: PlanSummary[];
  next_cursor: string | null;
  query_boundary: string;
}
export interface PlanListRpcSuccess {
  ok: true;
  data: PlanListPage;
}
export interface PlanRpcFailure {
  ok: false;
  error_code: string;
}
export interface PlanDetailRpcSuccess {
  ok: true;
  data: PlanDetail;
}
export interface DetectionStepContext {
  step_id: string;
  plan_id: string;
  world_id: string;
  baseline_snapshot_id: string;
  expected_child_pal_id: StableId;
  /**
   * @maxItems 4
   */
  required_passive_ids:
    | []
    | [StableId]
    | [StableId, StableId]
    | [StableId, StableId, StableId]
    | [StableId, StableId, StableId, StableId];
  preferred_gender: ("male" | "female") | null;
}
export interface CandidateDetectionWrite {
  pal_instance_uid: InstanceUid;
  match_score: number;
  match_breakdown: CandidateMatchBreakdown;
}
export interface CandidateDetectionBatchRequest {
  step_id: string;
  detected_snapshot_id: string;
  /**
   * @maxItems 500
   */
  candidates: CandidateDetectionWrite[];
}
