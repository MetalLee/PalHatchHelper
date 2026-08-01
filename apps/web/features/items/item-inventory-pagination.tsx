"use client";

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
import { useAppLocale, useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

import type { ItemInventoryQuery } from "./query";

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

function pageHref(
  locale: string,
  query: ItemInventoryQuery,
  pageNumber: number,
): string {
  const params = new URLSearchParams();
  if (query.query) params.set("query", query.query);
  if (query.type !== "all") params.set("type", query.type);
  if (query.pageSize !== 50) params.set("page_size", String(query.pageSize));
  params.set("page", String(pageNumber));
  return `/${locale}/items?${params.toString()}`;
}

function DisabledPageControl({
  label,
  symbol,
}: Readonly<{ label: string; symbol: string }>) {
  return (
    <span
      aria-disabled="true"
      className="pointer-events-none inline-flex size-11 min-h-11 shrink-0 items-center justify-center rounded-lg text-sm font-medium whitespace-nowrap opacity-50 sm:w-auto sm:px-3"
    >
      <span className="sr-only">{label}</span>
      {symbol}
    </span>
  );
}

function PaginationView({
  query,
  pageNumber,
  totalPages,
  className,
}: Readonly<{
  query: ItemInventoryQuery;
  pageNumber: number;
  totalPages: number;
  className?: string;
}>) {
  const locale = useAppLocale();
  const t = useCopy("Items");
  const tokens = pageTokens(pageNumber, totalPages);

  return (
    <Pagination className={className} aria-label={t("pagination")}>
      <PaginationContent>
        <PaginationItem>
          {pageNumber <= 1 ? (
            <DisabledPageControl label={t("previous")} symbol="‹" />
          ) : (
            <PaginationPrevious
              href={pageHref(locale, query, pageNumber - 1)}
            />
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
                Math.abs(token - pageNumber) > 1 && "hidden sm:list-item",
              )}
            >
              <PaginationLink
                href={pageHref(locale, query, token)}
                isActive={token === pageNumber}
                aria-label={t("pageStatus", {
                  page: token,
                  total: totalPages,
                })}
              >
                {token}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          {pageNumber >= totalPages ? (
            <DisabledPageControl label={t("next")} symbol="›" />
          ) : (
            <PaginationNext href={pageHref(locale, query, pageNumber + 1)} />
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export function ItemInventoryPagination({
  query,
  pageNumber,
  totalPages,
}: Readonly<{
  query: ItemInventoryQuery;
  pageNumber: number;
  totalPages: number;
}>) {
  const inlineRef = useRef<HTMLDivElement>(null);
  const [inventoryVisible, setInventoryVisible] = useState(false);
  const [inlineVisible, setInlineVisible] = useState(false);

  useEffect(() => {
    const inventory = document.getElementById("item-inventory-results");
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
  }, [totalPages]);

  if (totalPages <= 1) return null;
  const floatingVisible = inventoryVisible && !inlineVisible;

  return (
    <>
      <div
        ref={inlineRef}
        data-testid="item-pagination-inline"
        aria-hidden={floatingVisible}
        inert={floatingVisible ? true : undefined}
        className="border-t border-border/70 p-3"
      >
        <PaginationView
          query={query}
          pageNumber={pageNumber}
          totalPages={totalPages}
          className="rounded-2xl border border-border/60 bg-card/90 p-2 shadow-sm"
        />
      </div>
      <div
        data-testid="item-pagination-floating"
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
          pageNumber={pageNumber}
          totalPages={totalPages}
          className="pointer-events-auto w-max max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border/70 bg-background/92 p-1.5 shadow-lg backdrop-blur-xl"
        />
      </div>
    </>
  );
}
