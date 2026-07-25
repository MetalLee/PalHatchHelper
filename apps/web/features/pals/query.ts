import type { Database, InventoryScope } from "@palhatch/contracts";

type PalGender = Database["public"]["Enums"]["pal_gender"];
type PalLocationType = Database["public"]["Enums"]["pal_location_type"];
export type PalInventoryView = "cards" | "table";

export interface PalListQuery {
  scope: InventoryScope;
  query: string;
  owner: string;
  gender: PalGender | "";
  passive: string;
  location: PalLocationType | "";
  shared: boolean | null;
  page_size: number;
  page: number;
  context: string | null;
  view: PalInventoryView;
}

export interface InventoryPageContext {
  snapshot_id: string;
  game_data_version_id: string | null;
}

const scopes = new Set<InventoryScope>(["all", "mine", "shared"]);
const genders = new Set<PalGender>(["male", "female", "genderless", "unknown"]);
const locations = new Set<PalLocationType>([
  "player_party",
  "player_storage",
  "base",
  "dimensional_storage",
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
  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  const shared = params.get("shared");
  const requestedView = params.get("view");
  const context = shortValue(params.get("context"), 320);

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
    page:
      Number.isFinite(requestedPage) && requestedPage >= 1
        ? Math.min(requestedPage, 1_000_000)
        : 1,
    context: decodePageContext(context) === null ? null : context,
    view: requestedView === "table" ? "table" : "cards",
  };
}

export function encodePageContext(context: InventoryPageContext): string {
  return Buffer.from(JSON.stringify(context), "utf8").toString("base64url");
}

export function decodePageContext(
  context: string | null,
): InventoryPageContext | null {
  if (context === null || context.length === 0 || context.length > 320)
    return null;
  try {
    const value = JSON.parse(
      Buffer.from(context, "base64url").toString("utf8"),
    ) as Partial<InventoryPageContext>;
    if (
      typeof value.snapshot_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.snapshot_id,
      )
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
    };
  } catch {
    return null;
  }
}
