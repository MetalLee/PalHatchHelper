import type { Phase5Error } from "@palhatch/contracts";
import { NextResponse, type NextRequest } from "next/server";

import { authenticate } from "@/features/auth/authenticate";
import { isPasswordLoginEnabled } from "@/features/auth/password-login";
import { phase5HttpStatus } from "@/features/phase5-errors";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
};

export async function POST(request: NextRequest) {
  if (!isPasswordLoginEnabled()) {
    return NextResponse.json(
      { error_code: "PASSWORD_LOGIN_DISABLED" },
      { status: 404, headers: privateHeaders },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;
  if (typeof body?.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json<Phase5Error>(
      { error_code: "INVALID_CREDENTIALS" },
      { status: 400, headers: privateHeaders },
    );
  }

  const supabase = await createServerSupabaseClient();
  const result = await authenticate(supabase.auth, {
    email: body.email,
    password: body.password,
  });
  if (!result.ok) {
    return NextResponse.json<Phase5Error>(
      { error_code: result.error_code },
      { status: phase5HttpStatus(result.error_code), headers: privateHeaders },
    );
  }

  return NextResponse.json({ ok: true }, { headers: privateHeaders });
}
