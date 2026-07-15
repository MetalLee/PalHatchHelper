const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const MAXIMUM_STABLE_ID_LENGTH = 120;

export class PalworldStableIdError extends Error {
  readonly code: "GAME_ID_INVALID" | "GAME_ID_NORMALIZATION_COLLISION";

  constructor(code: "GAME_ID_INVALID" | "GAME_ID_NORMALIZATION_COLLISION") {
    super(code);
    this.name = "PalworldStableIdError";
    this.code = code;
  }
}

export function normalizePalworldStableId(source: string): string {
  const normalized = source.normalize("NFKC").toLowerCase();
  if (
    normalized.length === 0 ||
    normalized.length > MAXIMUM_STABLE_ID_LENGTH ||
    !STABLE_ID_PATTERN.test(normalized)
  ) {
    throw new PalworldStableIdError("GAME_ID_INVALID");
  }
  return normalized;
}

export function buildPalworldStableIdMap(
  sources: readonly string[],
): ReadonlyMap<string, string> {
  const byStableId = new Map<string, string>();
  const result = new Map<string, string>();
  for (const source of sources) {
    const stableId = normalizePalworldStableId(source);
    const previous = byStableId.get(stableId);
    if (previous !== undefined && previous !== source) {
      throw new PalworldStableIdError("GAME_ID_NORMALIZATION_COLLISION");
    }
    byStableId.set(stableId, source);
    result.set(source, stableId);
  }
  return result;
}
