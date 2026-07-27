"use client";

import type { PalInventoryPage } from "@palhatch/contracts";
import { useEffect, useRef, useState } from "react";
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
  for (const passive of query.passives) params.append("passive", passive);
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

function PaginationView({
  query,
  page,
  className,
}: Readonly<{
  query: PalListQuery;
  page: PalInventoryPage;
  className?: string;
}>) {
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
    <Pagination className={className} aria-label="帕鲁列表分页">
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
              className={cn(
                Math.abs(token - page.page_number) > 1 && "hidden sm:list-item",
              )}
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

export function PalPagination({
  query,
  page,
}: Readonly<{ query: PalListQuery; page: PalInventoryPage }>) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const [inventoryVisible, setInventoryVisible] = useState(false);
  const [inlineVisible, setInlineVisible] = useState(false);

  useEffect(() => {
    const inventory = document.getElementById("pal-inventory-results");
    const inline = inlineRef.current;
    if (
      inventory === null ||
      inline === null ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === inventory) {
            setInventoryVisible(entry.isIntersecting);
          }
          if (entry.target === inline) {
            setInlineVisible(entry.isIntersecting);
          }
        }
      },
      { rootMargin: "0px 0px 72px 0px" },
    );
    observer.observe(inventory);
    observer.observe(inline);
    return () => observer.disconnect();
  }, [page.total_pages, query.view]);

  if (page.total_pages <= 1) return null;

  const floatingVisible = inventoryVisible && !inlineVisible;

  return (
    <>
      <div
        ref={inlineRef}
        data-testid="pal-pagination-inline"
        aria-hidden={floatingVisible}
        inert={floatingVisible ? true : undefined}
      >
        <PaginationView
          query={query}
          page={page}
          className="rounded-2xl border border-border/60 bg-card/90 p-2 shadow-sm"
        />
      </div>
      <div
        data-testid="pal-pagination-floating"
        data-visible={String(floatingVisible)}
        aria-hidden={!floatingVisible}
        inert={!floatingVisible ? true : undefined}
        className={cn(
          "pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          floatingVisible
            ? "translate-y-0 opacity-100"
            : "translate-y-3 opacity-0",
        )}
      >
        <PaginationView
          query={query}
          page={page}
          className="pointer-events-auto w-max max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border/70 bg-background/92 p-1.5 shadow-lg backdrop-blur-xl"
        />
      </div>
    </>
  );
}
