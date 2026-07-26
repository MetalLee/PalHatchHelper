/* Generated from phase7-execution-plans.schema.json. Do not edit directly. */

export type Timestamp = string;
export type StableId = string;
export type OptimizationMode = "balanced" | "fastest" | "highest_success" | "least_borrowing";
export type FeasibilityStatus = "ready" | "needs_inventory";
export type PlanDifficulty = "low" | "medium" | "high";
export type Phase7ErrorCode =
  | "AUTH_REQUIRED"
  | "PLAYER_BINDING_REQUIRED"
  | "PLAN_NOT_FOUND"
  | "PLAN_ACCESS_DENIED"
  | "ROUTE_NOT_FOUND"
  | "DATA_UNAVAILABLE";
export type PlanListRpcResult = PlanListRpcSuccess | PlanRpcFailure;
export type PlanDetailRpcResult = PlanDetailRpcSuccess | PlanRpcFailure;

export interface SavePlanRequestContracts {
  SavePlanRequest: SavePlanRequest;
  SavePlanResponse: SavePlanResponse;
  RemovePlanResponse: RemovePlanResponse;
  PlanSummary: PlanSummary;
  Phase7ErrorCode: Phase7ErrorCode;
  PlanPassiveSummary: PlanPassiveSummary;
  PlanListPage: PlanListPage;
  PlanListRpcResult: PlanListRpcResult;
  PlanDetailReference: PlanDetailReference;
  PlanDetailRpcResult: PlanDetailRpcResult;
}
/**
 * Phase 7 read-only My Plans route-save contracts.
 */
export interface SavePlanRequest {
  route_id: string;
}
export interface SavePlanResponse {
  route_id: string;
  saved_at: Timestamp;
  reused: boolean;
}
export interface RemovePlanResponse {
  route_id: string;
  removed: boolean;
}
export interface PlanSummary {
  route_id: string;
  source_job_id: string;
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
  optimization_mode: OptimizationMode;
  feasibility_status: FeasibilityStatus;
  generation_count: number;
  step_count: number;
  borrowed_pal_count: number;
  missing_pal_count: number;
  estimated_attempts_min: number;
  estimated_attempts_max: number;
  difficulty: PlanDifficulty;
  total_score: number;
  saved_at: Timestamp;
}
export interface PlanPassiveSummary {
  passive_skill_id: StableId;
  display_name: string;
  rank: number | null;
  is_negative: boolean | null;
}
export interface PlanListPage {
  /**
   * @maxItems 100
   */
  items: PlanSummary[];
  next_cursor: string | null;
  query_boundary: Timestamp;
}
export interface PlanListRpcSuccess {
  ok: true;
  data: PlanListPage;
}
export interface PlanRpcFailure {
  ok: false;
  error_code: Phase7ErrorCode;
}
export interface PlanDetailReference {
  route_id: string;
  source_job_id: string;
  saved_at: Timestamp;
}
export interface PlanDetailRpcSuccess {
  ok: true;
  data: PlanDetailReference;
}
