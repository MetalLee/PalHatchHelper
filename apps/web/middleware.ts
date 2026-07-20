import type { Database } from "@palhatch/contracts";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

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

export function withPrivateCacheHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getPublicSupabaseConfig();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet)
          request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  if (
    user === null &&
    protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return withPrivateCacheHeaders(NextResponse.redirect(loginUrl));
  }
  if (user !== null && pathname === "/login") {
    return withPrivateCacheHeaders(
      NextResponse.redirect(new URL("/overview", request.url)),
    );
  }
  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return withPrivateCacheHeaders(response);
  }
  return response;
}

export const config = {
  matcher: [
    "/login",
    "/overview/:path*",
    "/pals/:path*",
    "/data-status/:path*",
    "/account/:path*",
    "/breeder/:path*",
    "/plans/:path*",
    "/admin/:path*",
  ],
};
