import type { PalInventoryPage } from "@palhatch/contracts";

type PalInventoryItem = PalInventoryPage["items"][number];

export function isDimensionalSharingUnresolved(pal: PalInventoryItem): boolean {
  return (
    pal.location_type === "dimensional_storage" &&
    pal.location_access_scope !== "guild"
  );
}

export function palShareLabel(
  pal: PalInventoryItem,
  dimensionalSharingUnresolved: boolean,
): string {
  if (dimensionalSharingUnresolved) return "共享权限未确认";
  if (pal.ownership_scope === "guild") return "公会所有";
  return pal.share_enabled ? "公会可用" : "仅自己";
}
