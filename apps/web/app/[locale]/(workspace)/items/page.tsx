import { Boxes, Clock3, Factory, MapPinned, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { PlayerBindingSetup } from "@/features/sync/player-binding-setup";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUserContext } from "@/features/auth/server";
import { InventoryTrendChart } from "@/features/items/inventory-trend-chart";
import {
  getGuildItemInventory,
  getGuildItemInventoryTrend,
} from "@/features/items/server";
import { Phase5DataError } from "@/features/phase5-errors";
import { Link } from "@/i18n/navigation";
import { catalogLocaleFor } from "@/i18n/routing";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(value: string | string[] | undefined, maximum = 160): string {
  return (Array.isArray(value) ? (value[0] ?? "") : (value ?? ""))
    .trim()
    .slice(0, maximum);
}

function itemHref(itemId: string, query: string, type: string): string {
  const params = new URLSearchParams({ item: itemId });
  if (query) params.set("query", query);
  if (type !== "all") params.set("type", type);
  return `/items?${params.toString()}`;
}

export default async function ItemsPage({
  searchParams,
  params,
}: {
  searchParams: SearchParams;
  params: Promise<{ locale: string }>;
}) {
  const locale = requireAppLocale((await params).locale);
  const catalogLocale = catalogLocaleFor(locale);
  const t = await getTranslations({ locale, namespace: "Items" });
  const context = await requireUserContext();
  if (context.binding === null) return <PlayerBindingSetup />;

  let inventory;
  try {
    inventory = await getGuildItemInventory(catalogLocale);
  } catch (error) {
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }

  const requested = await searchParams;
  const query = one(requested.query, 120).toLocaleLowerCase(catalogLocale);
  const requestedType = one(requested.type, 20);
  const type =
    requestedType === "material" || requestedType === "food"
      ? requestedType
      : "all";
  const filteredItems = inventory.items.filter((item) => {
    const matchesQuery =
      query.length === 0 ||
      item.name.toLocaleLowerCase(catalogLocale).includes(query) ||
      item.item_id.toLocaleLowerCase(catalogLocale).includes(query);
    const matchesType =
      type === "all" || item.type_a === type || item.type_b === type;
    return matchesQuery && matchesType;
  });
  const requestedItemId = one(requested.item, 120);
  const selectedItem =
    inventory.items.find((item) => item.item_id === requestedItemId) ??
    filteredItems[0] ??
    null;
  const requestedBaseId = one(requested.base, 160);
  const selectedBaseId =
    selectedItem?.bases.some((base) => base.base_id === requestedBaseId) ===
    true
      ? requestedBaseId
      : null;
  const bucket = one(requested.bucket, 10) === "day" ? "day" : "hour";
  let trend = null;
  if (selectedItem !== null) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      trend = await getGuildItemInventoryTrend({
        itemId: selectedItem.item_id,
        baseId: selectedBaseId,
        bucket,
        from,
        to,
      });
    } catch {
      trend = null;
    }
  }

  const totalQuantity = inventory.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );
  const baseCount = new Set(
    inventory.items.flatMap((item) => item.bases.map((base) => base.base_id)),
  ).size;
  const producibleCount = inventory.items.filter(
    (item) => (item.capacity?.craftable_additional ?? 0) > 0,
  ).length;
  const capturedAt =
    inventory.captured_at === null
      ? t("notAvailable")
      : new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(inventory.captured_at));

  return (
    <div className="grid min-w-0 gap-6 pb-4 sm:gap-8">
      <PageHero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      {inventory.status === "partial" ? (
        <section className="rounded-2xl border border-amber-300/70 bg-amber-50/85 p-4 text-sm text-amber-950">
          <p className="font-semibold">{t("partialTitle")}</p>
          <p className="mt-1 leading-6">{t("partialDescription")}</p>
        </section>
      ) : null}

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label={t("metricsLabel")}
      >
        <MetricCard
          label={t("itemKinds")}
          value={inventory.items.length.toLocaleString(catalogLocale)}
          icon={Boxes}
          compact
        />
        <MetricCard
          label={t("totalStock")}
          value={totalQuantity.toLocaleString(catalogLocale)}
          icon={Factory}
          tone="leaf"
          compact
        />
        <MetricCard
          label={t("baseCount")}
          value={baseCount.toLocaleString(catalogLocale)}
          icon={MapPinned}
          tone="sky"
          compact
        />
        <MetricCard
          label={t("latestSync")}
          value={capturedAt}
          detail={t("producibleKinds", { count: producibleCount })}
          icon={Clock3}
          tone="sky"
          compact
        />
      </section>

      <Card className="border-glass-border bg-white/82 shadow-soft">
        <CardHeader>
          <CardTitle>{t("inventoryTitle")}</CardTitle>
          <CardDescription>{t("inventoryDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            action={`/${locale}/items`}
            method="get"
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end"
          >
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("searchLabel")}
              <span className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  name="query"
                  type="search"
                  defaultValue={one(requested.query, 120)}
                  placeholder={t("searchPlaceholder")}
                  className="bg-white pl-9"
                />
              </span>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t("typeLabel")}
              <select
                name="type"
                defaultValue={type}
                className="min-h-9 rounded-md border border-input bg-white px-3 text-sm text-foreground"
              >
                <option value="all">{t("allTypes")}</option>
                <option value="material">{t("materials")}</option>
                <option value="food">{t("foods")}</option>
              </select>
            </label>
            <button
              type="submit"
              className="min-h-9 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {t("apply")}
            </button>
          </form>

          {inventory.status === "unavailable" ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("unavailable")}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {t("empty")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("item")}</TableHead>
                  <TableHead className="text-right">{t("quantity")}</TableHead>
                  <TableHead>{t("byBase")}</TableHead>
                  <TableHead className="text-right">{t("craftable")}</TableHead>
                  <TableHead>{t("recipe")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.item_id}>
                    <TableCell>
                      <Link
                        href={itemHref(
                          item.item_id,
                          one(requested.query, 120),
                          type,
                        )}
                        className="font-semibold text-foreground underline-offset-4 hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.item_id}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {item.quantity.toLocaleString(catalogLocale)}
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {item.bases.map((base) => (
                          <span
                            key={base.base_id}
                            className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
                          >
                            {base.name ?? base.base_id}:{" "}
                            {base.quantity.toLocaleString(catalogLocale)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {item.capacity?.craftable_additional.toLocaleString(
                        catalogLocale,
                      ) ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-normal text-xs text-muted-foreground">
                      {item.recipes[0]
                        ? item.recipes[0].ingredients
                            .map(
                              (ingredient) =>
                                `${ingredient.name} × ${ingredient.count}`,
                            )
                            .join(" + ")
                        : t("noRecipe")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedItem !== null ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
          <Card className="border-glass-border bg-white/82 shadow-soft">
            <CardHeader>
              <CardTitle>
                {t("trendTitle", { item: selectedItem.name })}
              </CardTitle>
              <CardDescription>{t("trendDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <form
                action={`/${locale}/items`}
                method="get"
                className="flex flex-wrap items-end gap-3"
              >
                <input type="hidden" name="item" value={selectedItem.item_id} />
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  {t("trendScope")}
                  <select
                    name="base"
                    defaultValue={selectedBaseId ?? ""}
                    className="min-h-9 rounded-md border border-input bg-white px-3 text-sm text-foreground"
                  >
                    <option value="">{t("wholeGuild")}</option>
                    {selectedItem.bases.map((base) => (
                      <option key={base.base_id} value={base.base_id}>
                        {base.name ?? base.base_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  {t("granularity")}
                  <select
                    name="bucket"
                    defaultValue={bucket}
                    className="min-h-9 rounded-md border border-input bg-white px-3 text-sm text-foreground"
                  >
                    <option value="hour">{t("hour")}</option>
                    <option value="day">{t("day")}</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className="min-h-9 rounded-md border border-input bg-white px-4 text-sm font-semibold text-foreground"
                >
                  {t("apply")}
                </button>
              </form>
              <InventoryTrendChart
                points={trend?.points ?? []}
                label={t("trendAria", { item: selectedItem.name })}
                emptyLabel={t("noTrend")}
              />
            </CardContent>
          </Card>

          <Card className="border-glass-border bg-white/82 shadow-soft">
            <CardHeader>
              <CardTitle>
                {t("capacityTitle", { item: selectedItem.name })}
              </CardTitle>
              <CardDescription>{t("capacityDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/45 p-3">
                  <p className="text-xs text-muted-foreground">{t("onHand")}</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {selectedItem.quantity.toLocaleString(catalogLocale)}
                  </p>
                </div>
                <div className="rounded-xl bg-leaf/12 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("additional")}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {selectedItem.capacity?.craftable_additional.toLocaleString(
                      catalogLocale,
                    ) ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-sky/14 p-3">
                  <p className="text-xs text-muted-foreground">
                    {t("obtainable")}
                  </p>
                  <p className="mt-1 text-xl font-bold tabular-nums">
                    {selectedItem.capacity?.obtainable_total.toLocaleString(
                      catalogLocale,
                    ) ?? "—"}
                  </p>
                </div>
              </div>
              <div className="grid gap-3">
                {selectedItem.recipes.map((recipe) => (
                  <div
                    key={recipe.recipe_id}
                    className="rounded-xl border border-border/70 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold">
                        {recipe.craft_kind === "cooking"
                          ? t("cooking")
                          : t("handcraft")}
                      </p>
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                        × {recipe.product_count}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {recipe.ingredients
                        .map(
                          (ingredient) =>
                            `${ingredient.name} × ${ingredient.count}`,
                        )
                        .join(" + ")}
                    </p>
                  </div>
                ))}
                {selectedItem.recipes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("noRecipe")}
                  </p>
                ) : null}
              </div>
              {selectedItem.capacity &&
              selectedItem.capacity.recipe_plan.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold">{t("planTitle")}</h3>
                  <ol className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
                    {selectedItem.capacity.recipe_plan.map((step, index) => (
                      <li key={`${step.recipe_id}:${index}`}>
                        {index + 1}. {step.product_item_id} —{" "}
                        {t("batches", {
                          count: step.batches,
                          produced: step.produced,
                        })}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
              {selectedItem.capacity &&
              selectedItem.capacity.limiting_materials.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("limiting")}:{" "}
                  {selectedItem.capacity.limiting_materials
                    .map(
                      (material) => `${material.item_id} +${material.missing}`,
                    )
                    .join(", ")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
