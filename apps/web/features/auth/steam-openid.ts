import { randomBytes as nodeRandomBytes, timingSafeEqual } from "node:crypto";

import { safeNextPath } from "./safe-next";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NAMESPACE = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = `${OPENID_NAMESPACE}/identifier_select`;
const STATE_TTL_MILLISECONDS = 10 * 60 * 1000;

export type SteamIntent = "login" | "link";

export type SteamAuthErrorCode =
  | "STEAM_STATE_MISSING"
  | "STEAM_STATE_INVALID"
  | "STEAM_STATE_EXPIRED"
  | "STEAM_ASSERTION_INVALID"
  | "STEAM_ID_INVALID";

export class SteamAuthError extends Error {
  constructor(readonly code: SteamAuthErrorCode) {
    super(code);
  }
}

type StatePayload = {
  state: string;
  issued_at: string;
  next: string;
  intent: SteamIntent;
};

function normalizePublicUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("PALBEACON_PUBLIC_URL_INVALID");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export { safeNextPath } from "./safe-next";

export function createSteamState({
  next,
  intent,
  now = new Date(),
  randomBytes = nodeRandomBytes,
}: {
  next: string | null | undefined;
  intent: SteamIntent;
  now?: Date;
  randomBytes?: (size: number) => Buffer;
}): { state: string; cookieValue: string } {
  const entropy = randomBytes(32);
  if (entropy.byteLength < 32) throw new Error("STEAM_STATE_ENTROPY_REQUIRED");
  const state = entropy.toString("hex");
  const payload: StatePayload = {
    state,
    issued_at: now.toISOString(),
    next: safeNextPath(next),
    intent,
  };
  return {
    state,
    cookieValue: Buffer.from(JSON.stringify(payload), "utf8").toString(
      "base64url",
    ),
  };
}

export function validateSteamState({
  cookieValue,
  callbackState,
  now = new Date(),
}: {
  cookieValue: string | null | undefined;
  callbackState: string | null | undefined;
  now?: Date;
}): Pick<StatePayload, "next" | "intent"> {
  if (!cookieValue) throw new SteamAuthError("STEAM_STATE_MISSING");
  let payload: StatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(cookieValue, "base64url").toString("utf8"),
    ) as StatePayload;
  } catch {
    throw new SteamAuthError("STEAM_STATE_INVALID");
  }
  if (
    typeof callbackState !== "string" ||
    typeof payload.state !== "string" ||
    !/^[0-9a-f]{64,}$/.test(payload.state) ||
    !constantTimeEqual(payload.state, callbackState) ||
    (payload.intent !== "login" && payload.intent !== "link")
  ) {
    throw new SteamAuthError("STEAM_STATE_INVALID");
  }
  const issuedAt = Date.parse(payload.issued_at);
  const age = now.getTime() - issuedAt;
  if (!Number.isFinite(issuedAt) || age < 0 || age > STATE_TTL_MILLISECONDS) {
    throw new SteamAuthError("STEAM_STATE_EXPIRED");
  }
  return { next: safeNextPath(payload.next), intent: payload.intent };
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function buildSteamAuthorizationUrl({
  publicUrl,
  state,
}: {
  publicUrl: string;
  state: string;
}): URL {
  const base = normalizePublicUrl(publicUrl);
  const realm =
    base.pathname === "/" ? base.origin : `${base.origin}${base.pathname}`;
  const callback = new URL("/api/auth/steam/callback", base);
  callback.searchParams.set("state", state);
  const target = new URL(STEAM_OPENID_ENDPOINT);
  target.searchParams.set("openid.ns", OPENID_NAMESPACE);
  target.searchParams.set("openid.mode", "checkid_setup");
  target.searchParams.set("openid.identity", IDENTIFIER_SELECT);
  target.searchParams.set("openid.claimed_id", IDENTIFIER_SELECT);
  target.searchParams.set("openid.realm", realm);
  target.searchParams.set("openid.return_to", callback.toString());
  return target;
}

export async function verifySteamAssertion(
  callbackParameters: URLSearchParams,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const verification = new URLSearchParams();
  for (const [key, value] of callbackParameters) {
    if (key.startsWith("openid.")) verification.append(key, value);
  }
  verification.set("openid.mode", "check_authentication");
  let response: Response;
  try {
    response = await fetcher(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: verification.toString(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SteamAuthError("STEAM_ASSERTION_INVALID");
  }
  const body = await response.text();
  if (!response.ok || !/^is_valid:true$/m.test(body)) {
    throw new SteamAuthError("STEAM_ASSERTION_INVALID");
  }
  const claimedId = callbackParameters.get("openid.claimed_id");
  const identity = callbackParameters.get("openid.identity");
  const match = claimedId?.match(
    /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );
  if (match?.[1] === undefined || identity !== claimedId) {
    throw new SteamAuthError("STEAM_ID_INVALID");
  }
  return match[1];
}
