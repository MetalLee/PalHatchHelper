import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/features/auth/safe-next";
import { isAppLocale } from "@/i18n/routing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export async function GET(request: NextRequest) {
  const localeValue = request.nextUrl.searchParams.get("locale");
  const locale = isAppLocale(localeValue) ? localeValue : "zh";
  const requestedNext = safeNextPath(request.nextUrl.searchParams.get("next"));
  const destination = requestedNext.startsWith(`/${locale}/`)
    ? requestedNext
    : `/${locale}${requestedNext}`;
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const supabase = await createServerSupabaseClient();

  let error: { code?: string } | null = null;
  if (code !== null) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash !== null && (type === "signup" || type === "email")) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    }));
  } else {
    error = { code: "EMAIL_CONFIRMATION_INVALID" };
  }

  if (error !== null) {
    const login = new URL(`/${locale}/login`, request.url);
    login.searchParams.set("error", "EMAIL_CONFIRMATION_FAILED");
    return redirectWithPrivateHeaders(login);
  }
  return redirectWithPrivateHeaders(new URL(destination, request.url));
}

function redirectWithPrivateHeaders(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  for (const [name, value] of Object.entries(privateHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
