import type { Database, InventoryScope } from "@palhatch/contracts";

type PalGender = Database["public"]["Enums"]["pal_gender"];
type PalLocationType = Database["public"]["Enums"]["pal_location_type"];

export interface PalListQuery {
  scope: InventoryScope;
  query: string;
  owner: string;
  gender: PalGender | "";
  passive: string;
  location: PalLocationType | "";
  shared: boolean | null;
  page_size: number;
  cursor: string | null;
}

export interface InventoryCursor {
  snapshot_id: string;
  game_data_version_id: string | null;
  pal_id: string;
  pal_instance_uid: string;
}

const scopes = new Set<InventoryScope>(["all", "mine", "shared"]);
const genders = new Set<PalGender>(["male", "female", "genderless", "unknown"]);
const locations = new Set<PalLocationType>([
  "player_party",
  "player_storage",
  "base",
  "viewing_cage",
  "unknown",
]);

function shortValue(value: string | null, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

export function parsePalListQuery(params: URLSearchParams): PalListQuery {
  const requestedScope = params.get("scope") as InventoryScope | null;
  const requestedGender = params.get("gender") as PalGender | null;
  const requestedLocation = params.get("location") as PalLocationType | null;
  const requestedPageSize = Number.parseInt(
    params.get("page_size") ?? "24",
    10,
  );
  const shared = params.get("shared");
  const cursor = shortValue(params.get("cursor"), 640);

  return {
    scope:
      requestedScope !== null && scopes.has(requestedScope)
        ? requestedScope
        : "all",
    query: shortValue(params.get("query"), 160),
    owner: shortValue(params.get("owner"), 64),
    gender:
      requestedGender !== null && genders.has(requestedGender)
        ? requestedGender
        : "",
    passive: shortValue(params.get("passive"), 120),
    location:
      requestedLocation !== null && locations.has(requestedLocation)
        ? requestedLocation
        : "",
    shared: shared === "true" ? true : shared === "false" ? false : null,
    page_size:
      Number.isFinite(requestedPageSize) && requestedPageSize >= 1
        ? Math.min(requestedPageSize, 50)
        : 24,
    cursor: decodeCursor(cursor),
  };
}

export function encodeCursor(cursor: InventoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursorValue(
  cursor: string | null,
): InventoryCursor | null {
  if (cursor === null || cursor.length === 0 || cursor.length > 640)
    return null;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as Partial<InventoryCursor>;
    if (
      typeof value.snapshot_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.snapshot_id,
      ) ||
      typeof value.pal_id !== "string" ||
      value.pal_id.length < 1 ||
      value.pal_id.length > 120 ||
      typeof value.pal_instance_uid !== "string" ||
      value.pal_instance_uid.length < 1 ||
      value.pal_instance_uid.length > 160
    ) {
      return null;
    }
    if (
      value.game_data_version_id !== null &&
      (typeof value.game_data_version_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.game_data_version_id,
        ))
    ) {
      return null;
    }
    return {
      snapshot_id: value.snapshot_id,
      game_data_version_id: value.game_data_version_id,
      pal_id: value.pal_id,
      pal_instance_uid: value.pal_instance_uid,
    };
  } catch {
    return null;
  }
}

function decodeCursor(cursor: string): string | null {
  return decodeCursorValue(cursor) === null ? null : cursor;
}
