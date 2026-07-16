import {
  parseAdoptRouteRequest,
  parseAdoptRouteResponse,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { authUserErrorCode } from "@/features/phase5-errors";
import { planHttpStatus, safePlanErrorCode } from "@/features/plans/server";
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
    return NextResponse.json(
      { error_code: authCode },
      { status: planHttpStatus(authCode), headers: privateHeaders },
    );
  let input;
  try {
    input = parseAdoptRouteRequest(await request.json());
  } catch {
    return NextResponse.json(
      { error_code: "ROUTE_NOT_ADOPTABLE" },
      { status: 400, headers: privateHeaders },
    );
  }
  const { data, error } = await supabase.rpc("adopt_breeding_route", {
    p_route_id: input.route_id,
    p_idempotency_key: input.idempotency_key,
  });
  if (error !== null) {
    const code = safePlanErrorCode(error);
    return NextResponse.json(
      { error_code: code },
      { status: planHttpStatus(code), headers: privateHeaders },
    );
  }
  try {
    return NextResponse.json(
      parseAdoptRouteResponse(Array.isArray(data) ? data[0] : data),
      {
        status: 201,
        headers: privateHeaders,
      },
    );
  } catch {
    return NextResponse.json(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
}
