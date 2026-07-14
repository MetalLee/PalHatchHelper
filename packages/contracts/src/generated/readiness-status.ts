/* Generated from readiness-status.schema.json. Do not edit directly. */

/**
 * Language-neutral readiness status returned by the private Agent.
 */
export interface ReadinessStatus {
  status: "ready" | "not_ready";
  service: string;
  version: string;
  timestamp: string;
  error_code: string | null;
  database_configured: boolean;
  job_worker_configured: boolean;
  save_worker_configured: boolean;
  game_catalog: GameCatalogHealth;
}
export interface GameCatalogHealth {
  status: "not_configured" | "configured" | "error";
  active_version_id: string | null;
  cache_status: "empty" | "warm" | "error";
}
