/* Generated from breeding-job.schema.json. Do not edit directly. */

export type OptimizationMode = "balanced" | "fastest" | "highest_success" | "least_borrowing";
export type BreedingJobStatus =
  | "pending"
  | "processing"
  | "algorithm_completed"
  | "ai_enriching"
  | "retry_pending"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Player-visible breeding job with database-fixed input versions.
 */
export interface BreedingJob {
  job_id: string;
  requester_user_id: string;
  player_id: string;
  guild_id: string | null;
  target_pal_id: string;
  /**
   * @minItems 0
   * @maxItems 4
   */
  desired_passive_ids: [] | [string] | [string, string] | [string, string, string] | [string, string, string, string];
  optimization_mode: OptimizationMode;
  inventory_snapshot_id: string;
  breeding_data_version_id: string;
  algorithm_version: string;
  scoring_profile_version: string;
  status: BreedingJobStatus;
  attempt_count: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}
