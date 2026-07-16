import {
  parseCreateBreedingJobRequest,
  parseCreateBreedingJobResponse,
  type BreedingError,
  type CreateBreedingJobResponse,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { authUserErrorCode } from "@/features/phase5-errors";
import {
  breederHttpStatus,
  safeBreedingErrorCode,
} from "@/features/breeder/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const authCode = authUserErrorCode(auth.user, authError);
  if (authCode !== null)
    return NextResponse.json<BreedingError>(
      { error_code: authCode },
      { status: breederHttpStatus(authCode), headers: privateHeaders },
    );
  let input;
  try {
    input = parseCreateBreedingJobRequest(await request.json());
  } catch {
    return NextResponse.json<BreedingError>(
      { error_code: "INVALID_BREEDING_REQUEST" },
      { status: 400, headers: privateHeaders },
    );
  }
  const { data, error } = await supabase.rpc("create_breeding_job_v2", {
    p_target_pal_id: input.target_pal_id,
    p_desired_passive_ids: [...input.desired_passive_ids],
    p_optimization_mode: input.optimization_mode,
    p_allow_guild_shared: input.allow_guild_shared,
    p_max_generations: input.max_generations,
  });
  if (error !== null) {
    const code = safeBreedingErrorCode(error);
    return NextResponse.json<BreedingError>(
      { error_code: code },
      { status: breederHttpStatus(code), headers: privateHeaders },
    );
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (row === undefined || row === null) {
    return NextResponse.json<BreedingError>(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
  const { data: job, error: jobError } = await supabase
    .from("breeding_jobs")
    .select("status")
    .eq("id", row.job_id)
    .single();
  if (jobError !== null || job === null) {
    return NextResponse.json<BreedingError>(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
  try {
    const result: CreateBreedingJobResponse = parseCreateBreedingJobResponse({
      job_id: row.job_id,
      reused: row.reused,
      status: job.status,
    });
    return NextResponse.json(result, { status: 201, headers: privateHeaders });
  } catch {
    return NextResponse.json<BreedingError>(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
}
