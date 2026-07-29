import { NextResponse, type NextRequest } from "next/server";

import {
  buildSteamAuthorizationUrl,
  createSteamState,
} from "@/features/auth/steam-openid";
import { getPublicAppUrl } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie, Authorization",
};

export async function GET(request: NextRequest) {
  const intent =
    request.nextUrl.searchParams.get("intent") === "link" ? "link" : "login";
  if (intent === "link") {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user === null) {
      return NextResponse.json(
        { error_code: "STEAM_LINK_AUTH_REQUIRED" },
        { status: 401, headers: privateHeaders },
      );
    }
  }
  const state = createSteamState({
    next: request.nextUrl.searchParams.get("next"),
    intent,
  });
  const target = buildSteamAuthorizationUrl({
    publicUrl: getPublicAppUrl(),
    state: state.state,
  });
  const response = NextResponse.redirect(target, { headers: privateHeaders });
  response.cookies.set("palbeacon_steam_state", state.cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/auth/steam",
  });
  return response;
}
