import {
  parsePlanDetailRpcResult,
  parsePlanListRpcResult,
  type Database,
  type PlanDetail,
  type PlanListPage,
  type PlanStatus,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export class PlanDataError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export type PlanStatusFilter = "all" | PlanStatus;

type Cursor = { createdAt: string; id: string };

export function encodePlanCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodePlanCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "createdAt" in parsed &&
      typeof parsed.createdAt === "string" &&
      "id" in parsed &&
      typeof parsed.id === "string" &&
      /^[0-9a-f-]{36}$/i.test(parsed.id) &&
      !Number.isNaN(Date.parse(parsed.createdAt))
    )
      return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {}
  throw new PlanDataError("PLAN_CURSOR_INVALID");
}

export async function loadPlans(
  options: {
    status?: PlanStatusFilter;
    cursor?: string;
    boundary?: string;
    limit?: number;
  } = {},
  client?: SupabaseClient<Database>,
): Promise<PlanListPage> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const cursor = decodePlanCursor(options.cursor);
  const { data, error } = await supabase.rpc("list_execution_plans", {
    p_status: options.status ?? "all",
    p_limit: options.limit ?? 20,
    p_cursor_created_at: cursor?.createdAt ?? undefined,
    p_cursor_id: cursor?.id ?? undefined,
    p_query_boundary: options.boundary ?? undefined,
  });
  if (error !== null) throw new PlanDataError("DATA_UNAVAILABLE");
  const result = parsePlanListRpcResult(data);
  if (!result.ok) throw new PlanDataError(result.error_code);
  const rawCursor = result.data.next_cursor;
  if (rawCursor === null) return result.data;
  const separator = rawCursor.lastIndexOf("|");
  if (separator < 0) throw new PlanDataError("DATA_UNAVAILABLE");
  return {
    ...result.data,
    next_cursor: encodePlanCursor({
      createdAt: rawCursor.slice(0, separator),
      id: rawCursor.slice(separator + 1),
    }),
  };
}

export async function loadPlanDetail(
  planId: string,
  client?: SupabaseClient<Database>,
): Promise<PlanDetail> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("get_execution_plan_detail", {
    p_plan_id: planId,
  });
  if (error !== null) throw new PlanDataError("DATA_UNAVAILABLE");
  const result = parsePlanDetailRpcResult(data);
  if (!result.ok) throw new PlanDataError(result.error_code);
  return result.data;
}

const safeCodes = new Set([
  "ROUTE_NOT_ADOPTABLE",
  "PLAN_NOT_FOUND",
  "PLAN_ACCESS_DENIED",
  "PLAN_VERSION_CONFLICT",
  "PLAN_INVALID_STATE_TRANSITION",
  "PLAN_NOT_CURRENT_STEP",
  "PLAN_PAUSED",
  "STEP_PREREQUISITE_INCOMPLETE",
  "CANDIDATE_NOT_FOUND",
  "CANDIDATE_ALREADY_USED",
  "CANDIDATE_SPECIES_MISMATCH",
  "CANDIDATE_CONFIRMATION_REQUIRED",
  "EXISTING_PAL_NOT_ELIGIBLE",
  "PLAN_DEPENDENCY_UNAVAILABLE",
  "PLAN_RECALCULATION_REQUIRED",
  "PLAN_FIXED_VERSION_UNAVAILABLE",
  "SNAPSHOT_DELTA_UNAVAILABLE",
]);

export function safePlanErrorCode(error: {
  code?: string;
  message?: string;
}): string {
  if (error.code === "42501") return "PLAN_ACCESS_DENIED";
  const message = error.message?.trim() ?? "";
  return safeCodes.has(message) ? message : "DATA_UNAVAILABLE";
}

export function planHttpStatus(code: string): number {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "PLAN_ACCESS_DENIED") return 403;
  if (code === "PLAN_NOT_FOUND" || code === "CANDIDATE_NOT_FOUND") return 404;
  if (code === "PLAN_VERSION_CONFLICT") return 409;
  if (code === "DATA_UNAVAILABLE") return 503;
  return 422;
}
