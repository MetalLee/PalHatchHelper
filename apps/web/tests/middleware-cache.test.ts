import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: { authenticated: true },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        setAll: (
          cookies: Array<{
            name: string;
            value: string;
            options: { path: string };
          }>,
        ) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        options.cookies.setAll([
          { name: "sb-session", value: "refreshed", options: { path: "/" } },
        ]);
        return {
          data: {
            user: authState.authenticated ? { id: "fixture-user" } : null,
          },
        };
      },
    },
  }),
}));

vi.mock("@/lib/supabase/config", () => ({
  getPublicSupabaseConfig: () => ({
    url: "https://example.invalid",
    anonKey: "fixture-anon-key",
  }),
}));

import { middleware, withPrivateCacheHeaders } from "../middleware";

describe("protected response caching", () => {
  beforeEach(() => {
    authState.authenticated = true;
  });

  it("marks authentication redirects private and non-cacheable", () => {
    const response = withPrivateCacheHeaders(
      NextResponse.redirect("https://example.invalid/login"),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
  });

  it("forwards refreshed auth cookies through the locale middleware response", async () => {
    const request = new NextRequest("https://example.invalid/zh/overview", {
      headers: { cookie: "sb-session=expired" },
    });

    const response = await middleware(request);

    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-session=refreshed",
    );
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });

  it("keeps the original query only inside the localized login return path", async () => {
    authState.authenticated = false;
    const request = new NextRequest(
      "https://example.invalid/en/overview?scope=mine",
      { headers: { cookie: "sb-session=expired" } },
    );

    const response = await middleware(request);
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("scope")).toBeNull();
    expect(location.searchParams.get("next")).toBe("/en/overview?scope=mine");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });
});
