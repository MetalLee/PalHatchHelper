export type SteamProfile = {
  personaName: string;
  avatarUrl: string | null;
  profileUrl: string | null;
};

export type SteamIdentity = { userId: string; steamId: string };

export type SteamIdentityWrite = SteamIdentity & SteamProfile;

export interface SteamAccountDependencies {
  findIdentity(steamId: string): Promise<SteamIdentity | null>;
  createAuthUser(
    email: string,
    metadata: { auth_source: "steam"; steam_id: string; display_name: string },
  ): Promise<{ id: string; email: string }>;
  getAuthUser(userId: string): Promise<{ id: string; email: string }>;
  ensureProfile(userId: string, displayName: string): Promise<void>;
  saveIdentity(identity: SteamIdentityWrite): Promise<void>;
  updateIdentity(identity: SteamIdentityWrite): Promise<void>;
  createMagicLinkToken(email: string): Promise<string>;
  verifyMagicLinkToken(tokenHash: string): Promise<void>;
}

export type SteamAccountErrorCode =
  | "STEAM_IDENTITY_CONFLICT"
  | "STEAM_ACCOUNT_UNAVAILABLE"
  | "STEAM_SESSION_UNAVAILABLE";

export class SteamAccountError extends Error {
  constructor(readonly code: SteamAccountErrorCode) {
    super(code);
  }
}

export function internalSteamEmail(steamId: string): string {
  if (!/^\d{17}$/.test(steamId))
    throw new SteamAccountError("STEAM_ACCOUNT_UNAVAILABLE");
  return `steam+${steamId}@auth.palbeacon.invalid`;
}

export async function resolveSteamLogin(
  dependencies: SteamAccountDependencies,
  steamId: string,
  profile: SteamProfile,
): Promise<{ userId: string }> {
  const existing = await dependencies.findIdentity(steamId);
  let userId: string;
  if (existing === null) {
    const email = internalSteamEmail(steamId);
    const user = await dependencies.createAuthUser(email, {
      auth_source: "steam",
      steam_id: steamId,
      display_name: profile.personaName,
    });
    userId = user.id;
    await dependencies.ensureProfile(userId, profile.personaName);
    await dependencies.saveIdentity({ userId, steamId, ...profile });
  } else {
    userId = existing.userId;
    await dependencies.updateIdentity({ userId, steamId, ...profile });
  }

  const authUser = await dependencies.getAuthUser(userId);
  if (!authUser.email) throw new SteamAccountError("STEAM_ACCOUNT_UNAVAILABLE");
  const tokenHash = await dependencies.createMagicLinkToken(authUser.email);
  if (!tokenHash) throw new SteamAccountError("STEAM_SESSION_UNAVAILABLE");
  await dependencies.verifyMagicLinkToken(tokenHash);
  return { userId };
}

export async function resolveSteamLink(
  dependencies: SteamAccountDependencies,
  currentUserId: string,
  steamId: string,
  profile: SteamProfile,
): Promise<{ userId: string }> {
  const existing = await dependencies.findIdentity(steamId);
  if (existing !== null && existing.userId !== currentUserId) {
    throw new SteamAccountError("STEAM_IDENTITY_CONFLICT");
  }
  const identity = { userId: currentUserId, steamId, ...profile };
  if (existing === null) await dependencies.saveIdentity(identity);
  else await dependencies.updateIdentity(identity);
  return { userId: currentUserId };
}

export async function fetchSteamProfile(
  steamId: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<SteamProfile> {
  const fallback: SteamProfile = {
    personaName: `Steam 玩家 ${steamId.slice(-4)}`,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
  };
  if (!apiKey) return fallback;
  const endpoint = new URL(
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
  );
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("steamids", steamId);
  try {
    const response = await fetcher(endpoint, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return fallback;
    const body = (await response.json()) as {
      response?: {
        players?: Array<{
          steamid?: unknown;
          personaname?: unknown;
          avatarfull?: unknown;
          profileurl?: unknown;
        }>;
      };
    };
    const player = body.response?.players?.find(
      (item) => item.steamid === steamId,
    );
    if (player === undefined) return fallback;
    return {
      personaName:
        typeof player.personaname === "string" && player.personaname.trim()
          ? player.personaname.slice(0, 120)
          : fallback.personaName,
      avatarUrl: safeSteamUrl(player.avatarfull, "avatars.steamstatic.com"),
      profileUrl: safeSteamProfileUrl(player.profileurl, steamId),
    };
  } catch {
    return fallback;
  }
}

function safeSteamUrl(value: unknown, hostname: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === hostname
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function safeSteamProfileUrl(value: unknown, steamId: string): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && url.hostname === "steamcommunity.com") {
        return url.toString();
      }
    } catch {
      // Use the trusted SteamID fallback below.
    }
  }
  return `https://steamcommunity.com/profiles/${steamId}`;
}
