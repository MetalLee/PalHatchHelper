import type { PalInventoryPage } from "@palhatch/contracts";

type PalLocationType = PalInventoryPage["items"][number]["location_type"];

export interface PalLocationFacts {
  location_type: PalLocationType;
  location_name: string | null;
  location_slot_index: number | null;
}

const locationLabels: Record<PalLocationType, string> = {
  player_party: "队伍",
  player_storage: "终端",
  base: "据点",
  dimensional_storage: "次元仓库",
  viewing_cage: "观赏笼",
  unknown: "未知位置",
};

export function palLocationDisplay(location: PalLocationFacts): {
  label: string;
  detail: string | null;
} {
  if (location.location_type === "base") {
    const base = location.location_name ?? locationLabels.base;
    return {
      label:
        location.location_slot_index === null
          ? base
          : `${base} · 工作位 ${location.location_slot_index + 1}`,
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
      detail: storagePage(location.location_slot_index),
    };
  }
  if (
    location.location_type === "player_party" &&
    location.location_slot_index !== null
  ) {
    return {
      label: locationLabels.player_party,
      detail: `队伍第 ${location.location_slot_index + 1} 位`,
    };
  }
  return { label: locationLabels[location.location_type], detail: null };
}

export function palLocationText(location: PalLocationFacts): string {
  const display = palLocationDisplay(location);
  return display.detail === null
    ? display.label
    : `${display.label} · ${display.detail}`;
}

function storagePage(slotIndex: number): string {
  return `第 ${Math.floor(slotIndex / 30) + 1} 页 · 第 ${(slotIndex % 30) + 1} 格`;
}
