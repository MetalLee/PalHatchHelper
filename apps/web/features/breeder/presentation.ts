import { userFacingCatalogName } from "@/lib/user-facing-name";

export function localizedName(
  names: ReadonlyMap<string, string>,
  id: string,
  entityLabel: string,
): string {
  return userFacingCatalogName(names.get(id) ?? "", id, entityLabel);
}

export function localizedNames(
  names: ReadonlyMap<string, string>,
  ids: readonly string[],
  entityLabel: string,
): string[] {
  return ids.map((id) => localizedName(names, id, entityLabel));
}

export function compactIdentifier(value: string, limit = 24): string {
  if (value.length <= limit) return value;
  const edge = Math.max(4, Math.floor((limit - 1) / 2));
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}
