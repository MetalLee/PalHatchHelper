import {
  parseShareMutationRpcResult,
  type Phase5Error,
} from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  authUserErrorCode,
  databaseFailureCode,
  phase5HttpStatus,
} from "@/features/phase5-errors";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ palInstanceUid: string }> },
) {
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

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json<Phase5Error>(
      { error_code: "INVALID_PAL_FILTER" },
      { status: 400, headers: privateHeaders },
    );
  }
  const { palInstanceUid } = await params;
  const { data, error } = await supabase.rpc("set_pal_share_enabled_for_web", {
    p_pal_instance_uid: palInstanceUid,
    p_enabled: body.enabled,
  });
  if (error !== null) {
    const code = databaseFailureCode(error);
    return NextResponse.json<Phase5Error>(
      { error_code: code },
      { status: phase5HttpStatus(code), headers: privateHeaders },
    );
  }
  try {
    const result = parseShareMutationRpcResult(data);
    if (!result.ok) {
      return NextResponse.json<Phase5Error>(
        { error_code: result.error_code },
        {
          status: phase5HttpStatus(result.error_code),
          headers: privateHeaders,
        },
      );
    }
    return NextResponse.json(result.data, { headers: privateHeaders });
  } catch {
    return NextResponse.json<Phase5Error>(
      { error_code: "DATA_UNAVAILABLE" },
      { status: 503, headers: privateHeaders },
    );
  }
}
