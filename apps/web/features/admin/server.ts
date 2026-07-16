import {
  parseAdminAuditEvents,
  parseAdminBindingCandidates,
  parseAdminBindingEvents,
  parseAdminCatalogVersions,
  parseAdminJobs,
  parseAdminOverview,
  parseAdminSaveParserStatus,
  parseRuntimeSettingsVersion,
  parseSecretConfigurationStatuses,
  type AdminAuditEvent,
  type AdminBindingCandidate,
  type AdminBindingEvent,
  type AdminCatalogVersion,
  type AdminJobSummary,
  type AdminOverview,
  type AdminSaveParserStatus,
  type Database,
  type RuntimeSettingsVersion,
  type SecretConfigurationStatus,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export class AdminDataError extends Error {
  constructor(readonly code: "ADMIN_ACCESS_DENIED" | "ADMIN_DATA_UNAVAILABLE") {
    super(code);
  }
}

export interface AdminGamePlayer {
  player_id: string;
  nickname: string;
  world_name: string;
  guild_name: string | null;
  level: number | null;
  bound_user_id: string | null;
}

export interface AdminCatalogSource {
  source_id: string;
  name: string;
  source_type: string;
  enabled: boolean;
}

export interface AdminCatalogWorld {
  world_id: string;
  name: string;
  active_version_id: string | null;
}

export interface AdminCatalogUpload {
  upload_id: string;
  filename: string;
  size_bytes: number;
  package_sha256: string;
  status: string;
  source: string | null;
  validation_summary: Record<string, unknown>;
  staged_version_id: string | null;
  created_at: string;
  updated_at: string;
}

function rpcError(error: { code?: string } | null): void {
  if (error === null) return;
  throw new AdminDataError(
    error.code === "42501" ? "ADMIN_ACCESS_DENIED" : "ADMIN_DATA_UNAVAILABLE",
  );
}

async function client(
  supplied?: SupabaseClient<Database>,
): Promise<SupabaseClient<Database>> {
  return supplied ?? (await createServerSupabaseClient());
}

export async function requireAdminPageAccess(
  supplied?: SupabaseClient<Database>,
): Promise<boolean> {
  noStore();
  const { data, error } = await (await client(supplied)).rpc("is_admin");
  rpcError(error);
  return data === true;
}

export async function loadAdminOverview(
  supplied?: SupabaseClient<Database>,
): Promise<AdminOverview> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("get_admin_overview");
  rpcError(error);
  return parseAdminOverview(data);
}

export async function loadAdminBindings(
  search = "",
  supplied?: SupabaseClient<Database>,
): Promise<{
  users: AdminBindingCandidate[];
  players: AdminGamePlayer[];
  events: AdminBindingEvent[];
}> {
  noStore();
  const supabase = await client(supplied);
  const [users, players, events] = await Promise.all([
    supabase.rpc("list_admin_binding_candidates", {
      p_search: search || undefined,
      p_limit: 100,
    }),
    supabase.rpc("list_admin_game_players", {
      p_search: search || undefined,
      p_limit: 200,
    }),
    supabase.rpc("list_player_binding_events", {
      p_user_id: undefined,
      p_limit: 100,
    }),
  ]);
  rpcError(users.error);
  rpcError(players.error);
  rpcError(events.error);
  if (!Array.isArray(players.data))
    throw new AdminDataError("ADMIN_DATA_UNAVAILABLE");
  const safePlayers: AdminGamePlayer[] = [];
  for (const row of players.data) {
    if (isAdminGamePlayer(row)) safePlayers.push(row);
  }
  if (safePlayers.length !== players.data.length)
    throw new AdminDataError("ADMIN_DATA_UNAVAILABLE");
  return {
    users: parseAdminBindingCandidates(users.data),
    players: safePlayers,
    events: parseAdminBindingEvents(events.data),
  };
}

export async function loadAdminSaveParserStatus(
  supplied?: SupabaseClient<Database>,
): Promise<AdminSaveParserStatus> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("get_admin_save_parser_status");
  rpcError(error);
  return parseAdminSaveParserStatus(data);
}

export async function loadAdminCatalogVersions(
  supplied?: SupabaseClient<Database>,
): Promise<AdminCatalogVersion[]> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("list_admin_catalog_versions", { p_limit: 50 });
  rpcError(error);
  return parseAdminCatalogVersions(data);
}

export async function loadAdminCatalogWorkspace(
  supplied?: SupabaseClient<Database>,
): Promise<{
  versions: AdminCatalogVersion[];
  sources: AdminCatalogSource[];
  worlds: AdminCatalogWorld[];
  uploads: AdminCatalogUpload[];
}> {
  noStore();
  const supabase = await client(supplied);
  const [versions, sources, worlds, uploads] = await Promise.all([
    supabase.rpc("list_admin_catalog_versions", { p_limit: 50 }),
    supabase.rpc("list_admin_catalog_sources"),
    supabase.rpc("list_admin_catalog_worlds"),
    supabase.rpc("list_admin_catalog_uploads", { p_limit: 30 }),
  ]);
  for (const result of [versions, sources, worlds, uploads])
    rpcError(result.error);
  return {
    versions: parseAdminCatalogVersions(versions.data),
    sources: parseRows(sources.data, isAdminCatalogSource),
    worlds: parseRows(worlds.data, isAdminCatalogWorld),
    uploads: parseRows(uploads.data, isAdminCatalogUpload),
  };
}

export async function loadAdminJobs(
  supplied?: SupabaseClient<Database>,
): Promise<AdminJobSummary[]> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("list_admin_jobs", { p_limit: 100 });
  rpcError(error);
  return parseAdminJobs(data);
}

export async function loadRuntimeSettings(
  supplied?: SupabaseClient<Database>,
): Promise<RuntimeSettingsVersion> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("get_runtime_settings");
  rpcError(error);
  return parseRuntimeSettingsVersion(data);
}

export async function loadAdminSecretStatuses(
  supplied?: SupabaseClient<Database>,
): Promise<SecretConfigurationStatus[]> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("get_admin_secret_statuses");
  rpcError(error);
  return parseSecretConfigurationStatuses(data);
}

export async function loadAdminAuditEvents(
  supplied?: SupabaseClient<Database>,
): Promise<AdminAuditEvent[]> {
  noStore();
  const { data, error } = await (
    await client(supplied)
  ).rpc("list_admin_audit_events", { p_limit: 100 });
  rpcError(error);
  return parseAdminAuditEvents(data);
}

function isAdminGamePlayer(value: unknown): value is AdminGamePlayer {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.player_id === "string" &&
    typeof row.nickname === "string" &&
    typeof row.world_name === "string" &&
    (typeof row.guild_name === "string" || row.guild_name === null) &&
    (typeof row.level === "number" || row.level === null) &&
    (typeof row.bound_user_id === "string" || row.bound_user_id === null)
  );
}

function parseRows<T>(value: unknown, guard: (row: unknown) => row is T): T[] {
  if (!Array.isArray(value)) throw new AdminDataError("ADMIN_DATA_UNAVAILABLE");
  const rows = value.filter(guard);
  if (rows.length !== value.length)
    throw new AdminDataError("ADMIN_DATA_UNAVAILABLE");
  return rows;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isAdminCatalogSource(value: unknown): value is AdminCatalogSource {
  const row = record(value);
  return (
    row !== null &&
    typeof row.source_id === "string" &&
    typeof row.name === "string" &&
    typeof row.source_type === "string" &&
    typeof row.enabled === "boolean"
  );
}

function isAdminCatalogWorld(value: unknown): value is AdminCatalogWorld {
  const row = record(value);
  return (
    row !== null &&
    typeof row.world_id === "string" &&
    typeof row.name === "string" &&
    nullableString(row.active_version_id)
  );
}

function isAdminCatalogUpload(value: unknown): value is AdminCatalogUpload {
  const row = record(value);
  return (
    row !== null &&
    typeof row.upload_id === "string" &&
    typeof row.filename === "string" &&
    typeof row.size_bytes === "number" &&
    typeof row.package_sha256 === "string" &&
    typeof row.status === "string" &&
    nullableString(row.source) &&
    record(row.validation_summary) !== null &&
    nullableString(row.staged_version_id) &&
    typeof row.created_at === "string" &&
    typeof row.updated_at === "string"
  );
}
