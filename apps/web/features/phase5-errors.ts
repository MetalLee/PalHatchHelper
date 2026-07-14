import type { Phase5ErrorCode } from "@palhatch/contracts";

export class Phase5DataError extends Error {
  constructor(readonly code: Phase5ErrorCode) {
    super(code);
  }
}

export function databaseFailureCode(error: {
  code?: string;
  message?: string;
}): Phase5ErrorCode {
  return error.code === "42501" ? "FORBIDDEN" : "DATA_UNAVAILABLE";
}

export function isMissingAuthSession(error: {
  code?: string;
  name?: string;
}): boolean {
  return (
    error.code === "session_not_found" ||
    error.code === "refresh_token_not_found" ||
    error.name === "AuthSessionMissingError"
  );
}

export function authUserErrorCode(
  user: unknown | null,
  error: { code?: string; name?: string } | null,
): Phase5ErrorCode | null {
  if (user !== null && error === null) return null;
  if (user === null && (error === null || isMissingAuthSession(error))) {
    return "AUTH_REQUIRED";
  }
  return "AUTH_UNAVAILABLE";
}

export function phase5HttpStatus(code: Phase5ErrorCode): number {
  switch (code) {
    case "AUTH_REQUIRED":
    case "INVALID_CREDENTIALS":
      return 401;
    case "AUTH_UNAVAILABLE":
    case "DATA_UNAVAILABLE":
      return 503;
    case "PLAYER_BINDING_REQUIRED":
    case "INVENTORY_SNAPSHOT_CHANGED":
    case "GAME_DATA_VERSION_CHANGED":
      return 409;
    case "PAL_NOT_OWNED":
    case "FORBIDDEN":
      return 403;
    case "INVALID_PAL_SCOPE":
    case "INVALID_PAL_FILTER":
    case "INVALID_PAGINATION":
      return 400;
  }
}
