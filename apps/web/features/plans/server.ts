import {
  parsePlanDetailRpcResult,
  parsePlanListRpcResult,
  type BreedingJobDetailRpcSuccess,
  type BreedingRoute,
  type Database,
  type PlanDetailReference,
  type PlanListPage,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { loadBreedingJob } from "@/features/breeder/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export class PlanDataError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface SavedPlanDetail {
  reference: PlanDetailReference;
  job: BreedingJobDetailRpcSuccess["data"];
  route: BreedingRoute;
}

type Cursor = { savedAt: string; routeId: string };

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
      "savedAt" in parsed &&
      typeof parsed.savedAt === "string" &&
      "routeId" in parsed &&
      typeof parsed.routeId === "string" &&
      /^[0-9a-f-]{36}$/i.test(parsed.routeId) &&
      !Number.isNaN(Date.parse(parsed.savedAt))
    )
      return { savedAt: parsed.savedAt, routeId: parsed.routeId };
  } catch {}
  throw new PlanDataError("PLAN_CURSOR_INVALID");
}

export async function loadPlans(
  options: { cursor?: string; boundary?: string; limit?: number } = {},
  client?: SupabaseClient<Database>,
): Promise<PlanListPage> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const cursor = decodePlanCursor(options.cursor);
  const { data, error } = await supabase.rpc("list_saved_breeding_plans", {
    p_limit: options.limit ?? 20,
    p_cursor_saved_at: cursor?.savedAt ?? undefined,
    p_cursor_route_id: cursor?.routeId ?? undefined,
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
      savedAt: rawCursor.slice(0, separator),
      routeId: rawCursor.slice(separator + 1),
    }),
  };
}

export async function loadPlanDetail(
  routeId: string,
  client?: SupabaseClient<Database>,
): Promise<SavedPlanDetail> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("get_saved_breeding_plan_detail", {
    p_route_id: routeId,
  });
  if (error !== null) throw new PlanDataError("DATA_UNAVAILABLE");
  const result = parsePlanDetailRpcResult(data);
  if (!result.ok) throw new PlanDataError(result.error_code);
  const job = await loadBreedingJob(result.data.source_job_id, supabase);
  const route = job.data.plan?.routes.find(
    (candidate) => candidate.route_id === routeId,
  );
  if (route === undefined) throw new PlanDataError("PLAN_NOT_FOUND");
  return { reference: result.data, job: job.data, route };
}

const safeCodes = new Set([
  "AUTH_REQUIRED",
  "PLAN_NOT_FOUND",
  "PLAN_ACCESS_DENIED",
  "ROUTE_NOT_FOUND",
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
  if (code === "PLAN_NOT_FOUND" || code === "ROUTE_NOT_FOUND") return 404;
  if (code === "DATA_UNAVAILABLE") return 503;
  return 422;
}
