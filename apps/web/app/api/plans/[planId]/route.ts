import { parseRemovePlanResponse } from "@palhatch/contracts";
import { NextResponse } from "next/server";

import { authUserErrorCode } from "@/features/phase5-errors";
import { planHttpStatus, safePlanErrorCode } from "@/features/plans/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ planId: string }> },
) {
  const { planId: routeId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(routeId))
    return NextResponse.json(
      { error_code: "PLAN_NOT_FOUND" },
      { status: 404, headers: privateHeaders },
    );
  const supabase = await createServerSupabaseClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const authCode = authUserErrorCode(auth.user, authError);
  if (authCode !== null)
    return NextResponse.json(
      { error_code: authCode },
      { status: planHttpStatus(authCode), headers: privateHeaders },
    );
  const { data, error } = await supabase.rpc("remove_breeding_plan", {
    p_route_id: routeId,
  });
  if (error !== null) {
    const code = safePlanErrorCode(error);
    return NextResponse.json(
      { error_code: code },
      { status: planHttpStatus(code), headers: privateHeaders },
    );
  }
  try {
    return NextResponse.json(parseRemovePlanResponse(data), {
      headers: privateHeaders,
    });
  } catch {
    return NextResponse.json(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
}
