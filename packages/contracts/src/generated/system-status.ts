/* Generated from system-status.schema.json. Do not edit directly. */

/**
 * Language-neutral health status shared by Web and Agent.
 */
export interface SystemStatus {
  status: "ok" | "ready" | "not_ready";
  service: string;
  version: string;
  timestamp: string;
}
