import type { GuildItemInventoryItem } from "@palhatch/contracts";

export const ITEM_PAGE_SIZES = [50, 100, 200] as const;

export type ItemInventoryType = "all" | "material" | "food";

export type ItemInventoryQuery = {
  query: string;
  type: ItemInventoryType;
  page: number;
  pageSize: (typeof ITEM_PAGE_SIZES)[number];
};

function positiveInteger(value: string | null, fallback: number): number {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseItemInventoryQuery(
  params: URLSearchParams,
): ItemInventoryQuery {
  const requestedType = params.get("type");
  const type: ItemInventoryType =
    requestedType === "material" || requestedType === "food"
      ? requestedType
      : "all";
  const requestedPageSize = positiveInteger(params.get("page_size"), 50);
  const pageSize = ITEM_PAGE_SIZES.includes(
    requestedPageSize as (typeof ITEM_PAGE_SIZES)[number],
  )
    ? (requestedPageSize as (typeof ITEM_PAGE_SIZES)[number])
    : 50;

  return {
    query: (params.get("query") ?? "").trim().slice(0, 120),
    type,
    page: positiveInteger(params.get("page"), 1),
    pageSize,
  };
}

export function prepareItemInventoryPage(
  items: readonly GuildItemInventoryItem[],
  query: ItemInventoryQuery,
  catalogLocale: string,
): {
  items: GuildItemInventoryItem[];
  totalCount: number;
  totalPages: number;
  pageNumber: number;
} {
  const normalizedQuery = query.query.toLocaleLowerCase(catalogLocale);
  const filtered = items
    .filter((item) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        item.name.toLocaleLowerCase(catalogLocale).includes(normalizedQuery);
      const matchesType =
        query.type === "all" ||
        item.type_a === query.type ||
        item.type_b === query.type;
      return matchesQuery && matchesType;
    })
    .sort(
      (left, right) =>
        right.quantity - left.quantity ||
        left.name.localeCompare(right.name, catalogLocale) ||
        left.item_id.localeCompare(right.item_id),
    );
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / query.pageSize);
  const pageNumber = Math.min(query.page, Math.max(totalPages, 1));
  const start = (pageNumber - 1) * query.pageSize;

  return {
    items: filtered.slice(start, start + query.pageSize),
    totalCount,
    totalPages,
    pageNumber,
  };
}

export function alphabeticIndex(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
