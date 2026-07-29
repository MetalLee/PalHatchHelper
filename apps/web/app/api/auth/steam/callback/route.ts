import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import {
  fetchSteamProfile,
  logSteamLoginFailure,
  resolveSteamLink,
  resolveSteamLogin,
  SteamAccountError,
  SteamAccountStageError,
  type SteamLoginStage,
} from "@/features/auth/steam-account";
import { createSteamAccountDependencies } from "@/features/auth/steam-supabase";
import {
  SteamAuthError,
  validateSteamState,
  verifySteamAssertion,
} from "@/features/auth/steam-openid";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getPublicAppUrl } from "@/lib/supabase/config";
import {
  createServerSupabaseClient,
  type SupabaseCookieToSet,
} from "@/lib/supabase/server";

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

function successRedirect(next: string, cookies: SupabaseCookieToSet[]) {
  const response = responseWithClearedState(
    NextResponse.redirect(new URL(next, getPublicAppUrl()), {
      headers: privateHeaders,
    }),
  );
  for (const cookie of cookies) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export async function GET(request: NextRequest) {
  const requestId = randomUUID();
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

  let stage: SteamLoginStage = "verify_assertion";
  let steamId: string | undefined;
  try {
    steamId = await verifySteamAssertion(request.nextUrl.searchParams);
    stage = "fetch_profile";
    const profile = await fetchSteamProfile(
      steamId,
      process.env.STEAM_WEB_API_KEY,
    );
    const sessionCookies: SupabaseCookieToSet[] = [];
    const session = await createServerSupabaseClient((cookies) => {
      sessionCookies.push(...cookies);
    });
    const dependencies = createSteamAccountDependencies(
      createAdminSupabaseClient(),
      session,
    );
    if (state.intent === "link") {
      stage = "get_auth_user";
      const { data, error } = await session.auth.getUser();
      if (error || data.user === null) {
        return errorRedirect("STEAM_LINK_AUTH_REQUIRED", state.next);
      }
      stage = "find_identity";
      await resolveSteamLink(dependencies, data.user.id, steamId, profile);
    } else {
      stage = "find_identity";
      await resolveSteamLogin(dependencies, steamId, profile, { requestId });
    }
    return successRedirect(state.next, sessionCookies);
  } catch (error) {
    const code =
      error instanceof SteamAuthError || error instanceof SteamAccountError
        ? error.code
        : "STEAM_AUTH_UNAVAILABLE";
    const failureStage =
      error instanceof SteamAccountStageError ? error.stage : stage;
    logSteamLoginFailure({
      stage: failureStage,
      errorCode: code,
      requestId,
      steamId,
      databaseCode:
        error instanceof SteamAccountStageError
          ? error.databaseCode
          : undefined,
      httpStatus:
        error instanceof SteamAccountStageError ? error.httpStatus : undefined,
    });
    return errorRedirect(code, state.next);
  }
}
