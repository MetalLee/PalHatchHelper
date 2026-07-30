import { basename, posix, resolve, win32 } from "node:path";

const WORLD_UID_PATTERN = /^[0-9a-f]{32}$/i;

export function normalizeWorldUid(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!WORLD_UID_PATTERN.test(normalized))
    throw new Error("WORLD_SAVE_ID_INVALID");
  return normalized;
}

export function worldUidFromSaveDirectory(saveDirectory: string): string {
  for (const candidate of [
    basename(resolve(saveDirectory)),
    win32.basename(saveDirectory),
    posix.basename(saveDirectory),
  ]) {
    if (WORLD_UID_PATTERN.test(candidate)) return candidate.toUpperCase();
  }
  throw new Error("WORLD_SAVE_ID_INVALID");
}
