/* Generated from phase8-admin.schema.json. Do not edit directly. */

export type AdminHealthState = "healthy" | "degraded" | "offline" | "not_configured" | "unknown";
export type NullableTimestamp = string | null;
export type Uuid = string;
export type Timestamp = string;
export type NullableUuid = string | null;
export type ContentHash = string;
export type StableErrorCode = string;
export type AdminCatalogAction =
  | "upload"
  | "validate"
  | "stage"
  | "publish"
  | "rollback"
  | "inspect"
  | "warm_cache"
  | "reject";
export type AdminJobAction =
  | "retry"
  | "cancel"
  | "reap_stale_lock"
  | "set_creation_enabled"
  | "template_ai_healthcheck";
export type AIProviderName = "openai_compatible" | "codex_cli" | "template";
export type AgentCommandType =
  | "sync_save_once"
  | "reparse_snapshot"
  | "approve_inventory_snapshot"
  | "reject_inventory_snapshot"
  | "cleanup_expired_agent_snapshots"
  | "retry_breeding_job"
  | "cancel_breeding_job"
  | "reap_stale_job_lock"
  | "template_ai_healthcheck"
  | "warm_catalog_cache";
export type IdempotencyKey = string;
export type AgentCommandStatus = "pending" | "processing" | "succeeded" | "failed" | "rejected" | "expired";
export type AdminErrorCode =
  | "ADMIN_ACCESS_DENIED"
  | "ADMIN_AUTH_REQUIRED"
  | "ADMIN_DATA_UNAVAILABLE"
  | "ADMIN_CONTRACT_INVALID"
  | "BINDING_CONFLICT"
  | "BINDING_VERSION_CONFLICT"
  | "BINDING_NOT_FOUND"
  | "AGENT_COMMAND_NOT_ALLOWED"
  | "AGENT_COMMAND_EXPIRED"
  | "AGENT_COMMAND_CONFLICT"
  | "CATALOG_UPLOAD_INVALID"
  | "CATALOG_UPLOAD_CONFLICT"
  | "CATALOG_UPLOAD_NOT_FOUND"
  | "CATALOG_UPLOAD_INCOMPLETE"
  | "CATALOG_UPLOAD_NOT_READY"
  | "CATALOG_UPLOAD_NOT_VALIDATED"
  | "CATALOG_ACTION_INVALID"
  | "CATALOG_ACTION_CONFLICT"
  | "CATALOG_CONFIRMATION_REQUIRED"
  | "JOB_ACTION_INVALID"
  | "RUNTIME_SETTINGS_INVALID"
  | "RUNTIME_SETTINGS_VERSION_CONFLICT"
  | "RUNTIME_SETTINGS_NOT_FOUND";

export interface AdminOverviewContracts {
  AdminOverview: AdminOverview;
  AdminBindingCandidate: AdminBindingCandidate;
  AdminBindingEvent: AdminBindingEvent;
  AdminSaveParserStatus: AdminSaveParserStatus;
  AdminCatalogVersion: AdminCatalogVersion;
  AdminCatalogAction: AdminCatalogAction;
  AdminJobSummary: AdminJobSummary;
  AdminJobAction: AdminJobAction;
  RuntimeSettings: RuntimeSettings;
  RuntimeSettingsVersion: RuntimeSettingsVersion;
  AgentCommand: AgentCommand;
  AgentCommandType: AgentCommandType;
  AgentCommandStatus: AgentCommandStatus;
  AdminAuditEvent: AdminAuditEvent;
  SecretConfigurationStatus: SecretConfigurationStatus;
  AdminError: AdminError;
  AdminErrorCode: AdminErrorCode;
}
/**
 * Phase 8 browser-safe administration, runtime settings, audit, and private Agent command contracts.
 */
export interface AdminOverview {
  agent: AdminWorkerStatus;
  save_worker: AdminWorkerStatus;
  job_worker: AdminWorkerStatus;
  candidate_detector: AdminWorkerStatus;
  latest_successful_snapshot: AdminSnapshotSummary | null;
  parser: AdminParserIdentity;
  catalog: AdminCatalogIdentity;
  job_counts: AdminJobCounts;
  ai_provider: AdminAIProviderStatus;
  recent_failure: AdminFailureSummary | null;
  disk: AdminDiskStatus;
  deployment_version: string;
  stale: boolean;
}
export interface AdminWorkerStatus {
  state: AdminHealthState;
  last_heartbeat_at: NullableTimestamp;
  stale: boolean;
}
export interface AdminSnapshotSummary {
  snapshot_id: Uuid;
  captured_at: Timestamp;
  pal_count: number;
  parser_name: string;
  parser_version: string;
}
export interface AdminParserIdentity {
  name: string | null;
  version: string | null;
}
export interface AdminCatalogIdentity {
  version_id: NullableUuid;
  build: string | null;
  game_version: string | null;
  content_hash: ContentHash | null;
}
export interface AdminJobCounts {
  pending: number;
  processing: number;
  retry: number;
  failed: number;
}
export interface AdminAIProviderStatus {
  provider: string;
  state: AdminHealthState;
  degraded: boolean;
  last_checked_at: NullableTimestamp;
}
export interface AdminFailureSummary {
  error_code: StableErrorCode;
  summary: string;
  occurred_at: Timestamp;
}
export interface AdminDiskStatus {
  level: "normal" | "warning" | "critical" | "unknown";
  available_bytes: number | null;
  checked_at: NullableTimestamp;
}
export interface AdminBindingCandidate {
  user_id: Uuid;
  user_display: string;
  role: "admin" | "player";
  player_id: NullableUuid;
  player_nickname: string | null;
  world_name: string | null;
  guild_name: string | null;
  binding_version: number | null;
  bound_at: NullableTimestamp;
  conflict_code: StableErrorCode | null;
}
export interface AdminBindingEvent {
  event_id: Uuid;
  event_type: "binding_created" | "binding_updated" | "binding_deleted";
  user_id: Uuid;
  player_id: NullableUuid;
  actor_display: string;
  created_at: Timestamp;
}
export interface AdminSaveParserStatus {
  worker: AdminWorkerStatus;
  save_root_configured: boolean;
  read_only_mount: "verified" | "unverified" | "not_configured";
  latest_snapshot: AdminSnapshotSummary | null;
  review_snapshot_id: NullableUuid;
  recent_failure: AdminFailureSummary | null;
  parser: AdminParserIdentity;
  parse_duration_ms: number | null;
  pal_count: number | null;
  inventory_drop_state: "normal" | "review_required" | "rejected" | "unknown";
  disk: AdminDiskStatus;
  snapshot_retention_count: number;
  stale: boolean;
}
export interface AdminCatalogVersion {
  version_id: Uuid;
  source: string | null;
  build: string | null;
  game_version: string | null;
  content_hash: ContentHash;
  package_hash: ContentHash;
  counts: AdminCatalogCounts;
  validation_state: "extracting" | "staging" | "validated" | "published" | "rejected";
  published_world: string | null;
  previous_version_id: NullableUuid;
  diff_summary: {
    [k: string]: unknown;
  };
  provenance: {
    [k: string]: unknown;
  };
  imported_at: Timestamp;
}
export interface AdminCatalogCounts {
  pals: number;
  passive_skills: number;
  active_skills: number;
  pal_active_skills: number;
  partner_skills: number;
  breeding_recipes: number;
  localizations: number;
}
export interface AdminJobSummary {
  job_id: Uuid;
  requester_display: string;
  status: string;
  snapshot_id: Uuid;
  catalog_version_id: Uuid;
  attempt_count: number;
  heartbeat_at: NullableTimestamp;
  locked: boolean;
  error_code: StableErrorCode | null;
  route_count: number;
  ai_provider: string | null;
  degraded: boolean;
  execution_plan_id: NullableUuid;
  created_at: Timestamp;
}
export interface RuntimeSettings {
  job_creation_enabled: boolean;
  max_generations: number;
  job_worker_concurrency: number;
  ai_concurrency: number;
  parser_timeout_seconds: number;
  snapshot_retention_count: number;
  data_stale_threshold_minutes: number;
  /**
   * @minItems 1
   * @maxItems 3
   */
  ai_provider_order:
    | [AIProviderName]
    | [AIProviderName, AIProviderName]
    | [AIProviderName, AIProviderName, AIProviderName];
  maintenance_announcement: string | null;
}
export interface RuntimeSettingsVersion {
  version_id: Uuid;
  version: number;
  settings: RuntimeSettings;
  created_by_display: string;
  created_at: Timestamp;
  rolled_back_from_version: number | null;
}
export interface AgentCommand {
  command_id: Uuid;
  command_type: AgentCommandType;
  payload: {
    [k: string]: unknown;
  };
  idempotency_key: IdempotencyKey;
  status: AgentCommandStatus;
  created_at: Timestamp;
  expires_at: Timestamp;
}
export interface AdminAuditEvent {
  event_id: Uuid;
  event_type: string;
  actor_display: string;
  target_type: string;
  target_id: string | null;
  safe_summary: {
    [k: string]: unknown;
  };
  created_at: Timestamp;
}
export interface SecretConfigurationStatus {
  name: string;
  status: "configured" | "not_configured";
  last_checked_at: NullableTimestamp;
}
export interface AdminError {
  error_code: AdminErrorCode;
  retryable: boolean;
}
