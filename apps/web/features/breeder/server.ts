import {
  parseBreederFormContextRpcResult,
  parseBreedingJobDetailRpcResult,
  type BreederFormContext,
  type BreedingJobDetailRpcSuccess,
  type Database,
} from "@palhatch/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unstable_noStore as noStore } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export class BreederDataError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export async function loadBreederFormContext(
  client?: SupabaseClient<Database>,
): Promise<BreederFormContext> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("get_breeder_form_context", {
    p_locale: "zh-CN",
  });
  if (error !== null) throw new BreederDataError("DATA_UNAVAILABLE");
  const result = parseBreederFormContextRpcResult(data);
  if (!result.ok) throw new BreederDataError(result.error_code);
  return result.data;
}

export async function loadBreedingJob(
  jobId: string,
  client?: SupabaseClient<Database>,
): Promise<BreedingJobDetailRpcSuccess> {
  noStore();
  const supabase = client ?? (await createServerSupabaseClient());
  const { data, error } = await supabase.rpc("get_breeding_job_detail", {
    p_job_id: jobId,
  });
  if (error !== null) throw new BreederDataError("DATA_UNAVAILABLE");
  const result = parseBreedingJobDetailRpcResult(data);
  if (!result.ok) throw new BreederDataError(result.error_code);
  return result;
}

const safeCodes = new Set([
  "AUTH_REQUIRED",
  "PLAYER_BINDING_REQUIRED",
  "PLAYER_BINDING_INVALID",
  "ACTIVE_INVENTORY_SNAPSHOT_REQUIRED",
  "PUBLISHED_GAME_DATA_VERSION_REQUIRED",
  "GAME_DATA_COMPATIBILITY_VERSION_REQUIRED",
  "ACTIVE_SCORING_PROFILE_REQUIRED",
  "INVALID_TARGET_PAL",
  "INVALID_DESIRED_PASSIVES",
  "INVALID_OPTIMIZATION_MODE",
  "INVALID_GUILD_SHARING",
  "INVALID_MAX_GENERATIONS",
  "TARGET_PAL_NOT_IN_GAME_DATA_VERSION",
  "DESIRED_PASSIVE_NOT_IN_GAME_DATA_VERSION",
  "JOB_CREATE_CONFLICT",
  "JOB_NOT_FOUND",
]);

export function safeBreedingErrorCode(error: {
  code?: string;
  message?: string;
}): string {
  if (error.code === "42501") return "FORBIDDEN";
  const message = error.message?.trim() ?? "";
  return safeCodes.has(message) ? message : "DATA_UNAVAILABLE";
}

export function breederHttpStatus(code: string): number {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "JOB_NOT_FOUND") return 404;
  if (code.startsWith("INVALID_") || code.startsWith("DESIRED_")) return 400;
  if (
    code.includes("REQUIRED") ||
    code === "PLAYER_BINDING_INVALID" ||
    code === "TARGET_PAL_NOT_IN_GAME_DATA_VERSION"
  )
    return 409;
  return 503;
}
