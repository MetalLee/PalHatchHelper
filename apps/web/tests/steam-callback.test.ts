import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSteamState } from "@/features/auth/steam-openid";

const fixtureSteamId = "76561198000005104";
const fixtureToken = "internal-magic-link-token-that-must-not-be-logged";

const state = vi.hoisted(() => ({
  accountFailure: null as "profile" | "session" | null,
  identities: new Map<string, { userId: string; steamId: string }>(),
  createAuthUser: vi.fn(),
  deleteAuthUser: vi.fn(),
  authCookieSetter: undefined as
    | ((
        cookies: Array<{
          name: string;
          value: string;
          options: { path: string; httpOnly: boolean };
        }>,
      ) => void)
    | undefined,
}));

vi.mock("@/features/auth/steam-openid", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/auth/steam-openid")>();
  return {
    ...actual,
    verifySteamAssertion: vi.fn(async () => fixtureSteamId),
  };
});

vi.mock("@/features/auth/steam-account", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/auth/steam-account")>();
  return {
    ...actual,
    fetchSteamProfile: vi.fn(async () => ({
      personaName: "Fixture Steam Player",
      avatarUrl: null,
      profileUrl: `https://steamcommunity.com/profiles/${fixtureSteamId}`,
    })),
  };
});

vi.mock("@/features/auth/steam-supabase", () => ({
  createSteamAccountDependencies: () => ({
    findIdentity: vi.fn(
      async (steamId) => state.identities.get(steamId) ?? null,
    ),
    createAuthUser: state.createAuthUser,
    deleteAuthUser: state.deleteAuthUser,
    getAuthUser: vi.fn(async (userId) => ({
      id: userId,
      email: `steam+${fixtureSteamId}@auth.palbeacon.invalid`,
    })),
    ensureProfile: vi.fn(async () => {
      if (state.accountFailure === "profile") {
        throw Object.assign(
          new Error("permission denied with private detail"),
          {
            code: "42501",
            status: 403,
            headers: { authorization: "service-role-secret" },
          },
        );
      }
    }),
    saveIdentity: vi.fn(async (identity) => {
      state.identities.set(identity.steamId, {
        userId: identity.userId,
        steamId: identity.steamId,
      });
    }),
    updateIdentity: vi.fn(async () => undefined),
    createMagicLinkToken: vi.fn(async () => {
      if (state.accountFailure === "session") {
        throw new Error(`failed token ${fixtureToken}`);
      }
      return fixtureToken;
    }),
    verifyMagicLinkToken: vi.fn(async () => {
      state.authCookieSetter?.([
        {
          name: "sb-fixture-auth-token",
          value: "fixture-session-value",
          options: { path: "/", httpOnly: true },
        },
      ]);
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(
    async (cookieSetter?: typeof state.authCookieSetter) => {
      state.authCookieSetter = cookieSetter;
      return { auth: { getUser: vi.fn() } };
    },
  ),
}));

vi.mock("@/lib/supabase/config", () => ({
  getPublicAppUrl: () => "https://www.palbeacon.app",
}));

import { GET } from "@/app/api/auth/steam/callback/route";

function callbackRequest(next = "/en/overview?scope=mine"): NextRequest {
  const steamState = createSteamState({
    next,
    intent: "login",
    now: new Date(),
    randomBytes: () => Buffer.alloc(32, 11),
  });
  const url = new URL("https://www.palbeacon.app/api/auth/steam/callback");
  url.searchParams.set("state", steamState.state);
  return new NextRequest(url, {
    headers: {
      cookie: `palbeacon_steam_state=${steamState.cookieValue}`,
    },
  });
}

describe("Steam callback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.accountFailure = null;
    state.identities.clear();
    state.authCookieSetter = undefined;
    state.createAuthUser.mockReset().mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000099",
      email: `steam+${fixtureSteamId}@auth.palbeacon.invalid`,
    });
    state.deleteAuthUser.mockReset().mockResolvedValue(undefined);
  });

  it("initializes a new user and carries the Supabase Session Cookie to the locale-aware redirect", async () => {
    const response = await GET(callbackRequest());

    expect(response.headers.get("location")).toBe(
      "https://www.palbeacon.app/en/overview?scope=mine",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.cookies.get("sb-fixture-auth-token")?.value).toBe(
      "fixture-session-value",
    );
    expect(response.cookies.get("palbeacon_steam_state")?.value).toBe("");
    expect(state.createAuthUser).toHaveBeenCalledTimes(1);
    expect(state.deleteAuthUser).not.toHaveBeenCalled();
  });

  it.each([
    ["profile", "STEAM_ACCOUNT_UNAVAILABLE"],
    ["session", "STEAM_SESSION_UNAVAILABLE"],
  ] as const)(
    "maps a %s failure to a stable public code, clears only state, and logs safe fields",
    async (failure, expectedCode) => {
      state.accountFailure = failure;
      const log = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      const response = await GET(callbackRequest("/zh/overview"));
      const location = new URL(response.headers.get("location") ?? "");

      expect(location.pathname).toBe("/zh/login");
      expect(location.searchParams.get("error")).toBe(expectedCode);
      expect(response.cookies.get("palbeacon_steam_state")?.value).toBe("");
      expect(response.cookies.get("sb-fixture-auth-token")).toBeUndefined();
      if (failure === "profile") {
        expect(state.deleteAuthUser).toHaveBeenCalledWith(
          "00000000-0000-4000-8000-000000000099",
        );
      } else {
        expect(state.deleteAuthUser).not.toHaveBeenCalled();
      }
      const logged = JSON.stringify(log.mock.calls);
      expect(logged).toContain("steam_login_failed");
      expect(logged).toContain(
        failure === "profile" ? "ensure_profile" : "create_session_token",
      );
      if (failure === "profile") {
        expect(logged).toContain("42501");
        expect(logged).toContain("403");
      }
      expect(logged).toContain("5104");
      expect(logged).not.toContain(fixtureSteamId);
      expect(logged).not.toContain(fixtureToken);
      expect(logged).not.toContain("service-role-secret");
      expect(logged).not.toContain("permission denied with private detail");
    },
  );
});
