import type { Database } from "@palhatch/contracts";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";

import { isAppLocale, routing, stripLocalePrefix } from "@/i18n/routing";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

const protectedPrefixes = [
  "/overview",
  "/pals",
  "/breeder",
  "/plans",
  "/data-status",
  "/account",
  "/admin",
];

const publicPaths = new Set([
  "/",
  "/palworld-save-sync",
  "/save-breeding-planner",
  "/passive-breeding-route",
  "/guild-pal-inventory",
]);

export function withPrivateCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

function copyResponseCookies(
  target: NextResponse,
  source: NextResponse,
): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  return target;
}

const handleI18nRouting = createIntlMiddleware(routing);

function localeFromPathname(pathname: string) {
  const value = pathname.split("/")[1];
  return isAppLocale(value) ? value : null;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const normalizedPathname = stripLocalePrefix(pathname);
  const locale = localeFromPathname(pathname);

  if (locale === null) {
    const response = handleI18nRouting(request);
    return protectedPrefixes.some((prefix) =>
      normalizedPathname.startsWith(prefix),
    )
      ? withPrivateCacheHeaders(response)
      : response;
  }

  if (publicPaths.has(normalizedPathname)) return handleI18nRouting(request);

  let authResponse = NextResponse.next({
    request: { headers: new Headers(request.headers) },
  });
  const { url, anonKey } = getPublicSupabaseConfig();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        authResponse = NextResponse.next({
          request: { headers: new Headers(request.headers) },
        });
        for (const { name, value, options } of cookiesToSet) {
          authResponse.cookies.set(name, value, options);
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const response = copyResponseCookies(
    handleI18nRouting(request),
    authResponse,
  );
  if (
    user === null &&
    protectedPrefixes.some((prefix) => normalizedPathname.startsWith(prefix))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return withPrivateCacheHeaders(
      copyResponseCookies(NextResponse.redirect(loginUrl), response),
    );
  }
  if (user !== null && normalizedPathname === "/login") {
    return withPrivateCacheHeaders(
      copyResponseCookies(
        NextResponse.redirect(new URL(`/${locale}/overview`, request.url)),
        response,
      ),
    );
  }
  if (normalizedPathname === "/login") {
    return withPrivateCacheHeaders(response);
  }
  if (
    protectedPrefixes.some((prefix) => normalizedPathname.startsWith(prefix))
  ) {
    return withPrivateCacheHeaders(response);
  }
  return response;
}

export const config = {
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
