import type { PalInventoryPage } from "@palhatch/contracts";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

import type { PalListQuery } from "./query";
import { encodePageContext } from "./query";

function pageContext(page: PalInventoryPage): string | null {
  return page.snapshot_id === null
    ? null
    : encodePageContext({
        snapshot_id: page.snapshot_id,
        game_data_version_id: page.game_data_version_id,
      });
}

function queryParams(
  query: PalListQuery,
  pageNumber: number,
  context: string | null,
): URLSearchParams {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.query) params.set("query", query.query);
  if (query.owner) params.set("owner", query.owner);
  if (query.gender) params.set("gender", query.gender);
  if (query.passive) params.set("passive", query.passive);
  if (query.location) params.set("location", query.location);
  if (query.shared !== null) params.set("shared", String(query.shared));
  if (query.page_size !== 24) params.set("page_size", String(query.page_size));
  if (query.view !== "cards") params.set("view", query.view);
  if (context !== null) params.set("context", context);
  params.set("page", String(pageNumber));
  return params;
}

type PageToken = number | "ellipsis";

function pageTokens(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}

export function PalPagination({
  query,
  page,
}: Readonly<{ query: PalListQuery; page: PalInventoryPage }>) {
  const context = pageContext(page);
  const previousHref =
    page.page_number > 1
      ? `/pals?${queryParams(query, page.page_number - 1, context).toString()}`
      : null;
  const nextHref =
    page.page_number < page.total_pages
      ? `/pals?${queryParams(query, page.page_number + 1, context).toString()}`
      : null;
  const tokens = pageTokens(page.page_number, page.total_pages);

  return (
    <Pagination
      className="rounded-2xl border border-glass-border bg-white/78 p-3 shadow-soft"
      aria-label="帕鲁列表分页"
    >
      <PaginationContent>
        <PaginationItem>
          {previousHref === null ? (
            <span
              aria-disabled="true"
              className={cn(
                "inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap opacity-50 sm:w-auto sm:px-3",
                "pointer-events-none",
              )}
            >
              <span className="sr-only">上一页不可用</span>‹
            </span>
          ) : (
            <PaginationPrevious href={previousHref} />
          )}
        </PaginationItem>
        {tokens.map((token, index) =>
          token === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${index}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem
              key={token}
              className={
                (token === 1 || token === page.total_pages) &&
                page.total_pages > 7
                  ? "hidden sm:list-item"
                  : undefined
              }
            >
              <PaginationLink
                href={`/pals?${queryParams(query, token, context).toString()}`}
                isActive={token === page.page_number}
                aria-label={`第 ${token} 页`}
              >
                {token}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          {nextHref === null ? (
            <span
              aria-disabled="true"
              className={cn(
                "inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap opacity-50 sm:w-auto sm:px-3",
                "pointer-events-none",
              )}
            >
              <span className="sr-only">下一页不可用</span>›
            </span>
          ) : (
            <PaginationNext href={nextHref} />
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
