import { NextResponse, type NextRequest } from "next/server";

export const syncPrivateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  vary: "Cookie, Authorization",
};

export class SyncHttpError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function syncError(error: unknown): NextResponse {
  if (error instanceof SyncHttpError) {
    return NextResponse.json(
      { error_code: error.code },
      { status: error.status, headers: syncPrivateHeaders },
    );
  }
  const code = databaseErrorCode(error);
  const statuses: Record<string, number> = {
    SYNC_DEVICE_UNAUTHORIZED: 401,
    SYNC_PAIRING_CODE_INVALID: 400,
    SYNC_PAIRING_CODE_EXPIRED: 410,
    SYNC_PAIRING_REQUEST_INVALID: 400,
    SYNC_DEVICE_WORLD_MISMATCH: 409,
    SYNC_WORLD_OWNED_BY_OTHER: 409,
    SYNC_CATALOG_NOT_PUBLISHED: 409,
    INVENTORY_DROP_REVIEW_REQUIRED: 409,
    INVENTORY_SNAPSHOT_STALE: 409,
    PLAYER_NOT_CLAIMABLE: 403,
    PLAYER_ALREADY_CLAIMED: 409,
    USER_ALREADY_BOUND: 409,
    SYNC_DEVICE_NOT_FOUND: 404,
    BINDING_INVITATION_INVALID: 404,
    BINDING_INVITATION_EXPIRED: 410,
  };
  const stableCode = code in statuses ? code : "SYNC_UNAVAILABLE";
  return NextResponse.json(
    { error_code: stableCode },
    { status: statuses[stableCode] ?? 503, headers: syncPrivateHeaders },
  );
}

function databaseErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "SYNC_UNAVAILABLE";
  const message = "message" in error ? error.message : null;
  return typeof message === "string" && /^[A-Z][A-Z0-9_]*$/.test(message)
    ? message
    : "SYNC_UNAVAILABLE";
}

export async function readLimitedJson(
  request: NextRequest,
  maximumBytes: number,
): Promise<unknown> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim();
  if (contentType !== "application/json") {
    throw new SyncHttpError("SYNC_CONTENT_TYPE_UNSUPPORTED", 415);
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new SyncHttpError("SYNC_PAYLOAD_TOO_LARGE", 413);
  }
  const reader = request.body?.getReader();
  if (reader === undefined) throw new SyncHttpError("SYNC_JSON_INVALID", 400);
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumBytes) {
      await reader.cancel();
      throw new SyncHttpError("SYNC_PAYLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  const body = Buffer.concat(chunks, receivedBytes);
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new SyncHttpError("SYNC_JSON_INVALID", 400);
  }
}

export function configuredMaximumPayloadBytes(): number {
  const parsed = Number(process.env.SYNC_MAX_PAYLOAD_BYTES ?? "5242880");
  return Number.isSafeInteger(parsed) &&
    parsed >= 1024 &&
    parsed <= 10 * 1024 * 1024
    ? parsed
    : 5 * 1024 * 1024;
}
