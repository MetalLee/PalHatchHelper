import type { PalInventoryPage } from "@palhatch/contracts";
import { getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";

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
  locale: AppLocale = "zh",
): string {
  const t = getCopy(locale, "Pals");
  if (dimensionalSharingUnresolved) return t("sharingUnconfirmed");
  if (pal.ownership_scope === "guild") return t("guildOwned");
  return pal.share_enabled ? t("shareEnabled") : t("shareDisabled");
}
