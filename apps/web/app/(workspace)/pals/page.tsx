import Link from "next/link";

import { EmptyState, ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import { PalFilters } from "@/features/pals/pal-filters";
import { PalInventory } from "@/features/pals/pal-inventory";
import { parsePalListQuery } from "@/features/pals/query";
import { listPals, Phase5DataError } from "@/features/pals/server";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toUrlSearchParams(values: Awaited<SearchParams>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

export default async function PalsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireUserContext();
  if (context.binding === null)
    return <ErrorState code="PLAYER_BINDING_REQUIRED" />;
  const rawParams = toUrlSearchParams(await searchParams);
  const query = parsePalListQuery(rawParams);

  let page;
  try {
    page = await listPals(query);
  } catch (error) {
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  const nextParams = new URLSearchParams(rawParams);
  if (page.next_cursor !== null) nextParams.set("cursor", page.next_cursor);
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">PAL INVENTORY</p>
          <h1>帕鲁列表</h1>
          <p>只展示当前账号可以用于协作的脱敏库存范围。</p>
        </div>
      </header>
      <PalFilters query={query} page={page} />
      {page.items.length === 0 ? (
        <EmptyState
          title="没有匹配的帕鲁"
          description="尝试清空部分筛选，或切换库存范围。"
        />
      ) : (
        <PalInventory page={page} />
      )}
      {page.next_cursor !== null ? (
        <div className="flex justify-center">
          <Link
            className="secondary-button"
            href={`/pals?${nextParams.toString()}`}
          >
            下一页
          </Link>
        </div>
      ) : null}
    </div>
  );
}
