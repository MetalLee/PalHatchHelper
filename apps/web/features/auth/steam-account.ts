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
  deleteAuthUser(userId: string): Promise<void>;
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

export type SteamLoginStage =
  | "verify_assertion"
  | "fetch_profile"
  | "find_identity"
  | "create_auth_user"
  | "ensure_profile"
  | "save_identity"
  | "update_identity"
  | "get_auth_user"
  | "create_session_token"
  | "verify_session"
  | "cleanup_auth_user";

type SteamLoginErrorMetadata = {
  databaseCode?: string;
  httpStatus?: number;
};

export type SteamLoginObservabilityContext = {
  requestId?: string;
};

export class SteamAccountError extends Error {
  constructor(
    readonly code: SteamAccountErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
  }
}

export class SteamAccountStageError extends SteamAccountError {
  readonly databaseCode?: string;
  readonly httpStatus?: number;

  constructor(
    code: SteamAccountErrorCode,
    readonly stage: SteamLoginStage,
    metadata: SteamLoginErrorMetadata = {},
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.databaseCode = metadata.databaseCode;
    this.httpStatus = metadata.httpStatus;
  }
}

function safeErrorMetadata(error: unknown): SteamLoginErrorMetadata {
  if (typeof error !== "object" || error === null) return {};
  const candidate = error as { code?: unknown; status?: unknown };
  return {
    databaseCode:
      typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)
        ? candidate.code
        : undefined,
    httpStatus:
      typeof candidate.status === "number" &&
      Number.isInteger(candidate.status) &&
      candidate.status >= 100 &&
      candidate.status <= 599
        ? candidate.status
        : undefined,
  };
}

export function steamAccountStageError(
  error: unknown,
  stage: SteamLoginStage,
  fallbackCode: SteamAccountErrorCode,
): SteamAccountStageError {
  if (error instanceof SteamAccountStageError) return error;
  const code = error instanceof SteamAccountError ? error.code : fallbackCode;
  return new SteamAccountStageError(code, stage, safeErrorMetadata(error), {
    cause: error,
  });
}

async function runStage<T>(
  stage: SteamLoginStage,
  fallbackCode: SteamAccountErrorCode,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw steamAccountStageError(error, stage, fallbackCode);
  }
}

function safeRequestId(value: string | undefined): string | undefined {
  return value !== undefined && /^[A-Za-z0-9._:-]{1,80}$/.test(value)
    ? value
    : undefined;
}

export function logSteamLoginFailure({
  stage,
  errorCode,
  steamId,
  requestId,
  databaseCode,
  httpStatus,
}: {
  stage: SteamLoginStage;
  errorCode: string;
  steamId?: string;
  requestId?: string;
  databaseCode?: string;
  httpStatus?: number;
}): void {
  const record: Record<string, string | number> = {
    event: "steam_login_failed",
    stage,
    error_code: errorCode,
  };
  const safeId = safeRequestId(requestId);
  if (safeId !== undefined) record.request_id = safeId;
  if (steamId !== undefined) record.steam_id_suffix = steamId.slice(-4);
  if (databaseCode !== undefined) record.database_code = databaseCode;
  if (httpStatus !== undefined) record.http_status = httpStatus;
  console.error(record);
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
  observability: SteamLoginObservabilityContext = {},
): Promise<{ userId: string }> {
  let createdUserId: string | null = null;
  let identityPersisted = false;

  try {
    const existing = await runStage(
      "find_identity",
      "STEAM_ACCOUNT_UNAVAILABLE",
      () => dependencies.findIdentity(steamId),
    );
    let userId: string;
    if (existing === null) {
      const user = await runStage(
        "create_auth_user",
        "STEAM_ACCOUNT_UNAVAILABLE",
        () => {
          const email = internalSteamEmail(steamId);
          return dependencies.createAuthUser(email, {
            auth_source: "steam",
            steam_id: steamId,
            display_name: profile.personaName,
          });
        },
      );
      userId = user.id;
      createdUserId = user.id;
      await runStage("ensure_profile", "STEAM_ACCOUNT_UNAVAILABLE", () =>
        dependencies.ensureProfile(userId, profile.personaName),
      );
      await runStage("save_identity", "STEAM_ACCOUNT_UNAVAILABLE", () =>
        dependencies.saveIdentity({ userId, steamId, ...profile }),
      );
      identityPersisted = true;
    } else {
      userId = existing.userId;
      identityPersisted = true;
      await runStage("update_identity", "STEAM_ACCOUNT_UNAVAILABLE", () =>
        dependencies.updateIdentity({ userId, steamId, ...profile }),
      );
    }

    const authUser = await runStage(
      "get_auth_user",
      "STEAM_ACCOUNT_UNAVAILABLE",
      () => dependencies.getAuthUser(userId),
    );
    if (!authUser.email) {
      throw new SteamAccountStageError(
        "STEAM_ACCOUNT_UNAVAILABLE",
        "get_auth_user",
      );
    }
    const tokenHash = await runStage(
      "create_session_token",
      "STEAM_SESSION_UNAVAILABLE",
      () => dependencies.createMagicLinkToken(authUser.email),
    );
    if (!tokenHash) {
      throw new SteamAccountStageError(
        "STEAM_SESSION_UNAVAILABLE",
        "create_session_token",
      );
    }
    await runStage("verify_session", "STEAM_SESSION_UNAVAILABLE", () =>
      dependencies.verifyMagicLinkToken(tokenHash),
    );
    return { userId };
  } catch (error) {
    if (createdUserId !== null && !identityPersisted) {
      try {
        await dependencies.deleteAuthUser(createdUserId);
      } catch (cleanupError) {
        const cleanup = steamAccountStageError(
          cleanupError,
          "cleanup_auth_user",
          "STEAM_ACCOUNT_UNAVAILABLE",
        );
        logSteamLoginFailure({
          stage: cleanup.stage,
          errorCode: cleanup.code,
          requestId: observability.requestId,
          steamId,
          databaseCode: cleanup.databaseCode,
          httpStatus: cleanup.httpStatus,
        });
      }
    }
    throw error;
  }
}

export async function resolveSteamLink(
  dependencies: SteamAccountDependencies,
  currentUserId: string,
  steamId: string,
  profile: SteamProfile,
): Promise<{ userId: string }> {
  const existing = await runStage(
    "find_identity",
    "STEAM_ACCOUNT_UNAVAILABLE",
    () => dependencies.findIdentity(steamId),
  );
  if (existing !== null && existing.userId !== currentUserId) {
    throw new SteamAccountError("STEAM_IDENTITY_CONFLICT");
  }
  const identity = { userId: currentUserId, steamId, ...profile };
  if (existing === null) {
    await runStage("save_identity", "STEAM_ACCOUNT_UNAVAILABLE", () =>
      dependencies.saveIdentity(identity),
    );
  } else {
    await runStage("update_identity", "STEAM_ACCOUNT_UNAVAILABLE", () =>
      dependencies.updateIdentity(identity),
    );
  }
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
