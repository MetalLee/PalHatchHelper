import type { PalInventoryPage } from "@palhatch/contracts";
import Link from "next/link";

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
}: Readonly<{ label: string; href: string | null }>) {
  return href === null ? (
    <span className="secondary-button" aria-disabled="true">
      {label}
    </span>
  ) : (
    <Link className="secondary-button" href={href}>
      {label}
    </Link>
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
    <nav className="pal-pagination" aria-label="帕鲁列表分页">
      <PageLink label="上一页" href={previousHref} />
      <span className="pal-page-summary" aria-live="polite">
        第 {page.page_number} / {page.total_pages} 页
      </span>
      <PageLink label="下一页" href={nextHref} />
      <form action="/pals" method="get" className="pal-page-jump">
        {Array.from(hiddenParams.entries()).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <label htmlFor="pal-page-number">跳转页码</label>
        <input
          id="pal-page-number"
          type="number"
          name="page"
          min={1}
          max={page.total_pages}
          defaultValue={page.page_number}
          inputMode="numeric"
        />
        <button className="secondary-button" type="submit">
          跳转
        </button>
      </form>
    </nav>
  );
}
