import type { Phase5Error } from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { parsePalListQuery } from "@/features/pals/query";
import { listPals, Phase5DataError } from "@/features/pals/server";
import { authUserErrorCode, phase5HttpStatus } from "@/features/phase5-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  const authCode = authUserErrorCode(user, authError);
  if (authCode !== null) {
    return NextResponse.json<Phase5Error>(
      { error_code: authCode },
      { status: phase5HttpStatus(authCode), headers: privateHeaders },
    );
  }
  try {
    const page = await listPals(
      parsePalListQuery(request.nextUrl.searchParams),
      supabase,
    );
    return NextResponse.json(page, { headers: privateHeaders });
  } catch (error) {
    const code =
      error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE";
    return NextResponse.json<Phase5Error>(
      { error_code: code },
      { status: phase5HttpStatus(code), headers: privateHeaders },
    );
  }
}
