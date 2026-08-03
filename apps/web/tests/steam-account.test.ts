import { describe, expect, it, vi } from "vitest";

import {
  fetchSteamProfile,
  isInternalSteamEmail,
  resolveSteamLogin,
  resolveSteamLink,
  SteamAccountError,
  type SteamAccountDependencies,
} from "@/features/auth/steam-account";

function dependencies(existing?: { userId: string; steamId: string }) {
  const identities = new Map<string, { userId: string; steamId: string }>();
  if (existing) identities.set(existing.steamId, existing);
  const deleteAuthUser = vi.fn(async () => undefined);
  const deps: SteamAccountDependencies = {
    findIdentity: vi.fn(async (steamId) => identities.get(steamId) ?? null),
    createAuthUser: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000099",
      email: "steam+76561198000000000@auth.palbeacon.invalid",
    })),
    deleteAuthUser,
    getAuthUser: vi.fn(async (userId) => ({
      id: userId,
      email:
        userId === "email-user"
          ? "player@example.invalid"
          : "steam+76561198000000000@auth.palbeacon.invalid",
    })),
    ensureProfile: vi.fn(async () => undefined),
    saveIdentity: vi.fn(async (identity) => {
      identities.set(identity.steamId, {
        userId: identity.userId,
        steamId: identity.steamId,
      });
    }),
    updateIdentity: vi.fn(async () => undefined),
    createMagicLinkToken: vi.fn(async () => "one-time-token-hash"),
    verifyMagicLinkToken: vi.fn(async () => undefined),
  };
  return deps;
}

const profile = {
  personaName: "Fixture Steam Player",
  avatarUrl: "https://avatars.steamstatic.com/fixture.jpg",
  profileUrl: "https://steamcommunity.com/profiles/76561198000000000",
};

describe("Steam to Supabase account bridge", () => {
  it("recognizes only the internal Steam bridge email used for display hiding", () => {
    expect(
      isInternalSteamEmail("steam+76561198000000000@auth.palbeacon.invalid"),
    ).toBe(true);
    expect(isInternalSteamEmail("player@example.com")).toBe(false);
    expect(isInternalSteamEmail("steam+short@auth.palbeacon.invalid")).toBe(
      false,
    );
  });

  it("uses a safe profile fallback when Steam Web API is unavailable", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      fetchSteamProfile("76561198000000000", "fixture-key", fetcher),
    ).resolves.toEqual({
      personaName: "Steam 玩家 0000",
      avatarUrl: null,
      profileUrl: "https://steamcommunity.com/profiles/76561198000000000",
    });
  });
  it("creates a new confirmed auth user and establishes an SSR magic-link session", async () => {
    const deps = dependencies();
    await expect(
      resolveSteamLogin(deps, "76561198000000000", profile),
    ).resolves.toEqual({ userId: "00000000-0000-4000-8000-000000000099" });
    expect(deps.createAuthUser).toHaveBeenCalledWith(
      "steam+76561198000000000@auth.palbeacon.invalid",
      expect.objectContaining({ auth_source: "steam" }),
    );
    expect(deps.ensureProfile).toHaveBeenCalled();
    expect(deps.saveIdentity).toHaveBeenCalled();
    expect(deps.createMagicLinkToken).toHaveBeenCalledWith(
      "steam+76561198000000000@auth.palbeacon.invalid",
    );
    expect(deps.verifyMagicLinkToken).toHaveBeenCalledWith(
      "one-time-token-hash",
    );
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes only the newly created Auth user when profile initialization fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.ensureProfile).mockRejectedValueOnce(
      Object.assign(new Error("profile write failed"), { code: "42501" }),
    );

    await expect(
      resolveSteamLogin(deps, "76561198000000000", profile),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAccountError>>({
        code: "STEAM_ACCOUNT_UNAVAILABLE",
      }),
    );
    expect(deps.deleteAuthUser).toHaveBeenCalledTimes(1);
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
    );
    expect(deps.saveIdentity).not.toHaveBeenCalled();
  });

  it("deletes the newly created Auth user when saving its Steam identity fails", async () => {
    const deps = dependencies();
    vi.mocked(deps.saveIdentity).mockRejectedValueOnce(
      new Error("identity write failed"),
    );

    await expect(
      resolveSteamLogin(deps, "76561198000000000", profile),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAccountError>>({
        code: "STEAM_ACCOUNT_UNAVAILABLE",
      }),
    );
    expect(deps.ensureProfile).toHaveBeenCalled();
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000099",
    );
  });

  it("keeps a fully initialized account after Session failure and retries it as existing", async () => {
    const deps = dependencies();
    vi.mocked(deps.createMagicLinkToken)
      .mockRejectedValueOnce(new Error("session provider unavailable"))
      .mockResolvedValueOnce("retry-token-hash");

    await expect(
      resolveSteamLogin(deps, "76561198000000000", profile),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAccountError>>({
        code: "STEAM_SESSION_UNAVAILABLE",
      }),
    );
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();

    await expect(
      resolveSteamLogin(deps, "76561198000000000", profile),
    ).resolves.toEqual({ userId: "00000000-0000-4000-8000-000000000099" });
    expect(deps.createAuthUser).toHaveBeenCalledTimes(1);
    expect(deps.updateIdentity).toHaveBeenCalledTimes(1);
    expect(deps.verifyMagicLinkToken).toHaveBeenCalledWith("retry-token-hash");
  });

  it("keeps the original profile error when cleanup also fails and logs only safe fields", async () => {
    const deps = dependencies();
    const profileError = Object.assign(new Error("sensitive database detail"), {
      code: "42501",
      headers: { authorization: "service-role-secret" },
    });
    vi.mocked(deps.ensureProfile).mockRejectedValueOnce(profileError);
    vi.mocked(deps.deleteAuthUser).mockRejectedValueOnce(
      new Error("cleanup included secret-token"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      Reflect.apply(resolveSteamLogin, undefined, [
        deps,
        "76561198000000000",
        profile,
        { requestId: "fixture-request-id" },
      ]),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "STEAM_ACCOUNT_UNAVAILABLE",
        stage: "ensure_profile",
      }),
    );
    expect(log).toHaveBeenCalledWith({
      event: "steam_login_failed",
      stage: "cleanup_auth_user",
      error_code: "STEAM_ACCOUNT_UNAVAILABLE",
      request_id: "fixture-request-id",
      steam_id_suffix: "0000",
    });
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("76561198000000000");
    expect(logged).not.toContain("secret-token");
    expect(logged).not.toContain("service-role-secret");
  });

  it("logs an existing Steam identity into its original auth user", async () => {
    const deps = dependencies({
      userId: "email-user",
      steamId: "76561198000000000",
    });
    await resolveSteamLogin(deps, "76561198000000000", profile);
    expect(deps.createAuthUser).not.toHaveBeenCalled();
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
    expect(deps.updateIdentity).toHaveBeenCalled();
    expect(deps.createMagicLinkToken).toHaveBeenCalledWith(
      "player@example.invalid",
    );
  });

  it("links an unclaimed SteamID to the current email user without merging users", async () => {
    const deps = dependencies();
    await expect(
      resolveSteamLink(deps, "email-user", "76561198000000000", profile),
    ).resolves.toEqual({ userId: "email-user" });
    expect(deps.saveIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "email-user" }),
    );
    expect(deps.createAuthUser).not.toHaveBeenCalled();
    expect(deps.createMagicLinkToken).not.toHaveBeenCalled();
  });

  it("refuses a SteamID already linked to another user", async () => {
    const deps = dependencies({
      userId: "other-user",
      steamId: "76561198000000000",
    });
    await expect(
      resolveSteamLink(deps, "email-user", "76561198000000000", profile),
    ).rejects.toEqual(
      expect.objectContaining<Partial<SteamAccountError>>({
        code: "STEAM_IDENTITY_CONFLICT",
      }),
    );
  });
});
