import type { PalInventoryPage } from "@palhatch/contracts";
import { ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  if (context !== null) params.set("context", context);
  params.set("page", String(pageNumber));
  return params;
}

function PageLink({
  label,
  href,
  direction,
}: Readonly<{
  label: string;
  href: string | null;
  direction: "previous" | "next";
}>) {
  const icon =
    direction === "previous" ? (
      <ArrowLeft aria-hidden="true" className="size-4" />
    ) : (
      <ArrowRight aria-hidden="true" className="size-4" />
    );

  return href === null ? (
    <Button variant="outline" disabled>
      {direction === "previous" ? icon : null}
      {label}
      {direction === "next" ? icon : null}
    </Button>
  ) : (
    <Button asChild variant="outline">
      <Link href={href}>
        {direction === "previous" ? icon : null}
        {label}
        {direction === "next" ? icon : null}
      </Link>
    </Button>
  );
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
  const hiddenParams = queryParams(query, page.page_number, context);
  hiddenParams.delete("page");

  return (
    <nav
      className="grid min-w-0 gap-4 rounded-3xl border border-glass-border bg-white/78 p-4 shadow-soft sm:grid-cols-[auto_1fr_auto] sm:items-center"
      aria-label="帕鲁列表分页"
    >
      <PageLink label="上一页" href={previousHref} direction="previous" />
      <span
        className="order-first text-center text-sm font-semibold tabular-nums text-foreground sm:order-none"
        aria-live="polite"
      >
        第 {page.page_number} / {page.total_pages} 页
      </span>
      <PageLink label="下一页" href={nextHref} direction="next" />

      <form
        action="/pals"
        method="get"
        className="col-span-full flex min-w-0 flex-wrap items-end justify-center gap-2 border-t border-border/70 pt-4"
      >
        {Array.from(hiddenParams.entries()).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="grid gap-1.5">
          <Label
            htmlFor="pal-page-number"
            className="text-xs text-muted-foreground"
          >
            跳转页码
          </Label>
          <Input
            id="pal-page-number"
            type="number"
            name="page"
            min={1}
            max={page.total_pages}
            defaultValue={page.page_number}
            inputMode="numeric"
            className="w-24 bg-white"
          />
        </div>
        <Button variant="secondary" type="submit">
          跳转
        </Button>
      </form>
    </nav>
  );
}
