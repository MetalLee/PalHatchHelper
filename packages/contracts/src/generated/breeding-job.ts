/* Generated from breeding-job.schema.json. Do not edit directly. */

export type StableId = string;
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
  locale: "zh-CN" | "en-US";
  job_id: string;
  requester_user_id: string;
  world_id: string;
  player_id: string;
  guild_id: string | null;
  target_pal_id: StableId;
  /**
   * @minItems 0
   * @maxItems 4
   */
  desired_passive_ids:
    | []
    | [StableId]
    | [StableId, StableId]
    | [StableId, StableId, StableId]
    | [StableId, StableId, StableId, StableId];
  optimization_mode: OptimizationMode;
  inventory_snapshot_id: string;
  game_data_version_id: string;
  breeding_data_version_id: string;
  game_data_content_hash: string;
  algorithm_version: string;
  scoring_profile_version: string;
  allow_guild_shared: boolean;
  max_generations: number;
  status: BreedingJobStatus;
  attempt_count: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}
