import { describe, expect, it, vi } from "vitest";

import {
  fetchSteamProfile,
  resolveSteamLogin,
  resolveSteamLink,
  SteamAccountError,
  type SteamAccountDependencies,
} from "@/features/auth/steam-account";

function dependencies(existing?: { userId: string; steamId: string }) {
  const identities = new Map<string, { userId: string; steamId: string }>();
  if (existing) identities.set(existing.steamId, existing);
  const deps: SteamAccountDependencies = {
    findIdentity: vi.fn(async (steamId) => identities.get(steamId) ?? null),
    createAuthUser: vi.fn(async () => ({
      id: "00000000-0000-4000-8000-000000000099",
      email: "steam+76561198000000000@auth.palbeacon.invalid",
    })),
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
  });

  it("logs an existing Steam identity into its original auth user", async () => {
    const deps = dependencies({
      userId: "email-user",
      steamId: "76561198000000000",
    });
    await resolveSteamLogin(deps, "76561198000000000", profile);
    expect(deps.createAuthUser).not.toHaveBeenCalled();
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
