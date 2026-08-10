import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { authState } = vi.hoisted(() => ({
  authState: { authenticated: true, getUserCalls: 0 },
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
        authState.getUserCalls += 1;
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
    authState.getUserCalls = 0;
  });

  it("marks authentication redirects private and non-cacheable", () => {
    const response = withPrivateCacheHeaders(
      NextResponse.redirect("https://example.invalid/login"),
    );

    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
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
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
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
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("protects every workspace, admin and dynamic private route in both locales", async () => {
    authState.authenticated = false;
    const routes = [
      "/overview",
      "/pals",
      "/breeder",
      "/breeder/jobs/fixture-job",
      "/plans",
      "/plans/fixture-plan",
      "/data-status",
      "/account",
      "/admin",
      "/admin/jobs",
    ];

    for (const locale of ["zh", "en"] as const) {
      for (const route of routes) {
        const path = `/${locale}${route}`;
        const response = await middleware(
          new NextRequest(`https://example.invalid${path}`),
        );
        const location = new URL(response.headers.get("location") ?? "");
        expect(location.pathname).toBe(`/${locale}/login`);
        expect(location.searchParams.get("next")).toBe(path);
        expect(response.headers.get("cache-control")).toBe(
          "private, no-store, max-age=0",
        );
        expect(response.headers.get("x-robots-tag")).toBe(
          "noindex, nofollow, noarchive",
        );
      }
    }
  });

  it("adds noindex response headers to public authentication screens", async () => {
    authState.authenticated = false;
    for (const path of ["/zh/login", "/zh/register"]) {
      const response = await middleware(
        new NextRequest(`https://example.invalid${path}`),
      );

      expect(response.headers.get("x-robots-tag")).toBe(
        "noindex, nofollow, noarchive",
      );
      expect(response.headers.get("cache-control")).toBe(
        "private, no-store, max-age=0",
      );
    }
  });

  it("serves every indexable public route without querying the user session", async () => {
    const slugs = [
      "",
      "/palworld-save-sync",
      "/save-breeding-planner",
      "/passive-breeding-route",
      "/guild-pal-inventory",
    ];

    for (const locale of ["zh", "en"] as const) {
      for (const slug of slugs) {
        const response = await middleware(
          new NextRequest(`https://example.invalid/${locale}${slug}`),
        );
        expect(response.headers.get("x-robots-tag")).toBeNull();
        expect(response.headers.get("cache-control")).not.toBe(
          "private, no-store, max-age=0",
        );
      }
    }
    expect(authState.getUserCalls).toBe(0);
  });
});
