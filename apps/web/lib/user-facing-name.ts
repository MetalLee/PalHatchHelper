export function userFacingCatalogName(
  displayName: string,
  internalId: string,
  fallback: string,
): string {
  const normalized = displayName.trim();
  return normalized.length > 0 && normalized !== internalId
    ? normalized
    : fallback;
}
