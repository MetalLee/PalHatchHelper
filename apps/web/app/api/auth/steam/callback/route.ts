import { NextResponse, type NextRequest } from "next/server";

import {
  fetchSteamProfile,
  resolveSteamLink,
  resolveSteamLogin,
  SteamAccountError,
} from "@/features/auth/steam-account";
import { createSteamAccountDependencies } from "@/features/auth/steam-supabase";
import {
  SteamAuthError,
  validateSteamState,
  verifySteamAssertion,
} from "@/features/auth/steam-openid";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie, Authorization",
};

function responseWithClearedState(response: NextResponse): NextResponse {
  response.cookies.set("palbeacon_steam_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/api/auth/steam",
  });
  return response;
}

function errorRedirect(code: string, next = "/overview"): NextResponse {
  const locale = next.match(/^\/(zh|en)(?:\/|$)/)?.[1] ?? "zh";
  const target = new URL(`/${locale}/login`, getPublicAppUrl());
  target.searchParams.set("error", code);
  return responseWithClearedState(
    NextResponse.redirect(target, { headers: privateHeaders }),
  );
}

export async function GET(request: NextRequest) {
  let state: { next: string; intent: "login" | "link" };
  try {
    state = validateSteamState({
      cookieValue: request.cookies.get("palbeacon_steam_state")?.value,
      callbackState: request.nextUrl.searchParams.get("state"),
    });
  } catch (error) {
    return errorRedirect(
      error instanceof SteamAuthError ? error.code : "STEAM_STATE_INVALID",
    );
  }

  try {
    const steamId = await verifySteamAssertion(request.nextUrl.searchParams);
    const profile = await fetchSteamProfile(
      steamId,
      process.env.STEAM_WEB_API_KEY,
    );
    const session = await createServerSupabaseClient();
    const dependencies = createSteamAccountDependencies(
      createAdminSupabaseClient(),
      session,
    );
    if (state.intent === "link") {
      const { data, error } = await session.auth.getUser();
      if (error || data.user === null) {
        return errorRedirect("STEAM_LINK_AUTH_REQUIRED", state.next);
      }
      await resolveSteamLink(dependencies, data.user.id, steamId, profile);
    } else {
      await resolveSteamLogin(dependencies, steamId, profile);
    }
    return responseWithClearedState(
      NextResponse.redirect(new URL(state.next, getPublicAppUrl()), {
        headers: privateHeaders,
      }),
    );
  } catch (error) {
    const code =
      error instanceof SteamAuthError || error instanceof SteamAccountError
        ? error.code
        : "STEAM_AUTH_UNAVAILABLE";
    return errorRedirect(code, state.next);
  }
}
