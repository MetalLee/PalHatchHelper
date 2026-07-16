import type { BreedingError } from "@palhatch/contracts";
import { NextResponse } from "next/server";

import { authUserErrorCode } from "@/features/phase5-errors";
import {
  breederHttpStatus,
  BreederDataError,
  loadBreedingJob,
} from "@/features/breeder/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const authCode = authUserErrorCode(auth.user, authError);
  if (authCode !== null)
    return NextResponse.json<BreedingError>(
      { error_code: authCode },
      { status: breederHttpStatus(authCode), headers: privateHeaders },
    );
  const { jobId } = await params;
  try {
    const result = await loadBreedingJob(jobId, supabase);
    return NextResponse.json(result, { headers: privateHeaders });
  } catch (error) {
    const code =
      error instanceof BreederDataError ? error.code : "DATA_UNAVAILABLE";
    return NextResponse.json<BreedingError>(
      { error_code: code },
      { status: breederHttpStatus(code), headers: privateHeaders },
    );
  }
}
