import { NextResponse, type NextRequest } from "next/server";

import {
  registerPasswordAccount,
  type RegistrationErrorCode,
} from "@/features/auth/register";
import { isPasswordLoginEnabled } from "@/features/auth/password-login";
import { safeNextPath } from "@/features/auth/safe-next";
import { isAppLocale } from "@/i18n/routing";
import { getPublicAppUrl } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  vary: "Cookie, Authorization",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

export async function POST(request: NextRequest) {
  if (!isPasswordLoginEnabled()) {
    return NextResponse.json(
      { error_code: "REGISTRATION_DISABLED" },
      { status: 404, headers: privateHeaders },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    display_name?: unknown;
    email?: unknown;
    password?: unknown;
    password_confirmation?: unknown;
    locale?: unknown;
    next?: unknown;
  } | null;
  const localeValue =
    typeof body?.locale === "string" ? body.locale : undefined;
  if (
    typeof body?.display_name !== "string" ||
    typeof body.email !== "string" ||
    typeof body.password !== "string" ||
    typeof body.password_confirmation !== "string" ||
    !isAppLocale(localeValue)
  ) {
    return NextResponse.json(
      { error_code: "INVALID_REGISTRATION" },
      { status: 400, headers: privateHeaders },
    );
  }

  const locale = localeValue;
  const next = safeNextPath(typeof body.next === "string" ? body.next : null);
  const localizedNext = next.startsWith(`/${locale}/`)
    ? next
    : `/${locale}${next}`;
  const emailRedirect = new URL("/api/auth/confirm", getPublicAppUrl());
  emailRedirect.searchParams.set("locale", locale);
  emailRedirect.searchParams.set("next", localizedNext);

  const supabase = await createServerSupabaseClient();
  const result = await registerPasswordAccount(supabase.auth, {
    displayName: body.display_name,
    email: body.email,
    password: body.password,
    passwordConfirmation: body.password_confirmation,
    emailRedirectTo: emailRedirect.toString(),
  });
  if (!result.ok) {
    return NextResponse.json(
      { error_code: result.error_code },
      {
        status: registrationHttpStatus(result.error_code),
        headers: privateHeaders,
      },
    );
  }

  return NextResponse.json(result, { headers: privateHeaders });
}

function registrationHttpStatus(code: RegistrationErrorCode): number {
  if (code === "EMAIL_UNAVAILABLE") return 409;
  if (code === "REGISTRATION_UNAVAILABLE") return 503;
  return 400;
}
