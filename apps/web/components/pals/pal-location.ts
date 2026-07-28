import type { PalInventoryPage } from "@palhatch/contracts";
import { getCopy } from "@/i18n/client";
import type { AppLocale } from "@/i18n/routing";

type PalLocationType = PalInventoryPage["items"][number]["location_type"];

export interface PalLocationFacts {
  location_type: PalLocationType;
  location_name: string | null;
  location_slot_index: number | null;
}

const locationLabelKeys = {
  player_party: "party",
  player_storage: "storage",
  base: "base",
  dimensional_storage: "dimensionalStorage",
  viewing_cage: "viewingCage",
  unknown: "unknownLocation",
};

export function palLocationDisplay(
  location: PalLocationFacts,
  locale: AppLocale = "zh",
): {
  label: string;
  detail: string | null;
} {
  const t = getCopy(locale, "Pals");
  const locationLabels = Object.fromEntries(
    Object.entries(locationLabelKeys).map(([key, value]) => [
      key,
      t(value as "party"),
    ]),
  ) as Record<PalLocationType, string>;
  if (location.location_type === "base") {
    const base = location.location_name ?? locationLabels.base;
    return {
      label:
        location.location_slot_index === null
          ? base
          : t("workSlot", {
              base,
              slot: location.location_slot_index + 1,
            }),
      detail: null,
    };
  }
  if (
    (location.location_type === "player_storage" ||
      location.location_type === "dimensional_storage") &&
    location.location_slot_index !== null
  ) {
    return {
      label: locationLabels[location.location_type],
      detail: storagePage(location.location_slot_index, locale),
    };
  }
  if (
    location.location_type === "player_party" &&
    location.location_slot_index !== null
  ) {
    return {
      label: locationLabels.player_party,
      detail: t("partySlot", { slot: location.location_slot_index + 1 }),
    };
  }
  return { label: locationLabels[location.location_type], detail: null };
}

export function palLocationText(
  location: PalLocationFacts,
  locale: AppLocale = "zh",
): string {
  const display = palLocationDisplay(location, locale);
  return display.detail === null
    ? display.label
    : `${display.label} · ${display.detail}`;
}

function storagePage(slotIndex: number, locale: AppLocale): string {
  return getCopy(locale, "Pals")("storageSlot", {
    page: Math.floor(slotIndex / 30) + 1,
    slot: (slotIndex % 30) + 1,
  });
}
