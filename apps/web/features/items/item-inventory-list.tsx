"use client";

import type { GuildItemInventoryItem } from "@palhatch/contracts";
import { UtensilsCrossed } from "lucide-react";
import Image from "next/image";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useCopy } from "@/i18n/client";
import { itemIconPath } from "@/lib/pal-assets";

import { ItemInventorySparkline } from "./item-inventory-sparkline";

function periodChange(item: GuildItemInventoryItem): number {
  const previousQuantity = item.trend_1h
    .slice(0, -1)
    .findLast((quantity): quantity is number => quantity !== null);

  return previousQuantity === undefined ? 0 : item.quantity - previousQuantity;
}

function formatPeriodChange(change: number, locale: string): string {
  return `${change >= 0 ? "+" : ""}${change.toLocaleString(locale)}`;
}

function ItemIcon({
  itemId,
  testId,
  size = 44,
}: Readonly<{
  itemId: string;
  testId: string;
  size?: number;
}>) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border/70 bg-muted/45 shadow-xs"
      style={{ width: size, height: size }}
    >
      <Image
        data-testid={testId}
        src={itemIconPath(itemId)}
        alt=""
        width={size}
        height={size}
        className="size-full object-contain"
      />
    </span>
  );
}

function ItemDistribution({
  item,
  baseLabels,
  catalogLocale,
}: Readonly<{
  item: GuildItemInventoryItem;
  baseLabels: Readonly<Record<string, string>>;
  catalogLocale: string;
}>) {
  const t = useCopy("Items");
  const baseIds = Object.keys(baseLabels).sort();
  return (
    <div className="flex min-h-8 min-w-0 flex-wrap content-center gap-1.5">
      {item.bases.map((base) => {
        const baseIndex = Math.max(baseIds.indexOf(base.base_id), 0);
        const hue = Math.round((baseIndex * 360) / Math.max(baseIds.length, 1));
        return (
          <Badge
            key={base.base_id}
            variant="outline"
            className="font-medium"
            style={{
              backgroundColor: `hsl(${hue} 82% 92%)`,
              borderColor: `hsl(${hue} 48% 72%)`,
            }}
          >
            {baseLabels[base.base_id] ?? t("baseFallback")}
            <span className="ml-1 tabular-nums">
              {base.quantity.toLocaleString(catalogLocale)}
            </span>
          </Badge>
        );
      })}
      {item.guild_chest_quantity > 0 ? (
        <Badge
          variant="outline"
          className="border-sky/35 bg-sky/10 font-medium"
        >
          {t("guildChest")}
          <span className="ml-1 tabular-nums">
            {item.guild_chest_quantity.toLocaleString(catalogLocale)}
          </span>
        </Badge>
      ) : null}
    </div>
  );
}

export function ItemInventoryList({
  items,
  baseLabels,
  catalogLocale,
}: Readonly<{
  items: readonly GuildItemInventoryItem[];
  baseLabels: Readonly<Record<string, string>>;
  catalogLocale: string;
}>) {
  const t = useCopy("Items");

  return (
    <section id="item-inventory-results" className="min-w-0">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(15rem,1.2fr)_7rem_7rem_7rem_minmax(14rem,1fr)_minmax(18rem,1.25fr)_1.25rem] items-center gap-3 border-y border-border/70 bg-muted/25 px-4 py-2.5 text-xs font-semibold text-muted-foreground xl:grid"
      >
        <span>{t("item")}</span>
        <span className="text-right">{t("quantity")}</span>
        <span className="text-right">{t("periodChange")}</span>
        <span className="text-right">{t("craftableAmount")}</span>
        <span>{t("trend1h")}</span>
        <span>{t("distribution")}</span>
        <span />
      </div>

      <Accordion type="multiple" className="min-w-0">
        {items.map((item) => {
          const isFood = item.type_a === "food" || item.type_b === "food";
          const change = periodChange(item);
          return (
            <AccordionItem key={item.item_id} value={item.item_id}>
              <AccordionTrigger className="min-h-[5.5rem] px-4 py-3 hover:no-underline [&>svg]:mt-7">
                <div className="grid min-w-0 flex-1 items-center gap-3 text-left sm:grid-cols-[minmax(13rem,1fr)_7rem_7rem_7rem] xl:grid-cols-[minmax(15rem,1.2fr)_7rem_7rem_7rem_minmax(14rem,1fr)_minmax(18rem,1.25fr)]">
                  <div className="flex min-w-0 items-center gap-3">
                    <ItemIcon itemId={item.item_id} testId="item-icon" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground sm:text-base">
                        {item.name}
                      </p>
                      <Badge variant="outline" className="mt-1 font-normal">
                        {isFood ? t("foodType") : t("materialType")}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-muted-foreground sm:hidden">
                      {t("quantity")}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {item.quantity.toLocaleString(catalogLocale)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-muted-foreground sm:hidden">
                      {t("periodChange")}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {formatPeriodChange(change, catalogLocale)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-muted-foreground sm:hidden">
                      {t("craftableAmount")}
                    </p>
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {item.capacity?.craftable_additional.toLocaleString(
                        catalogLocale,
                      ) ?? "—"}
                    </p>
                  </div>
                  <ItemInventorySparkline
                    label={t("trend1hAria", { item: item.name })}
                    points={item.trend_1h}
                    currentQuantity={item.quantity}
                    className="sm:col-span-4 xl:col-auto"
                  />
                  <div className="hidden xl:block">
                    <ItemDistribution
                      item={item}
                      baseLabels={baseLabels}
                      catalogLocale={catalogLocale}
                    />
                  </div>
                  <div className="sm:col-span-4 xl:hidden">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      {t("distribution")}
                    </p>
                    <ItemDistribution
                      item={item}
                      baseLabels={baseLabels}
                      catalogLocale={catalogLocale}
                    />
                  </div>
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-4 pb-5">
                <div className="border-t border-border/70 pt-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("recipes")}
                    </h3>
                    {item.recipes.length > 0 ? (
                      <div className="mt-2 grid gap-3 xl:grid-cols-2">
                        {item.recipes.map((recipe, recipeIndex) => (
                          <div
                            key={recipe.recipe_id}
                            className="rounded-xl border border-border/70 bg-background/72 p-3 shadow-xs"
                          >
                            <div className="flex items-center gap-3">
                              <ItemIcon
                                itemId={item.item_id}
                                testId="recipe-icon"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-foreground">
                                  {t("recipeNumber", {
                                    number: recipeIndex + 1,
                                  })}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                  {recipe.craft_kind === "cooking" ? (
                                    <UtensilsCrossed
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                  ) : null}
                                  {recipe.craft_kind === "cooking"
                                    ? t("cooking")
                                    : t("handcraft")}
                                  <span aria-hidden="true">·</span>
                                  {t("productCount", {
                                    count: recipe.product_count,
                                  })}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {recipe.ingredients.map((ingredient) => (
                                <div
                                  key={`${recipe.recipe_id}:${ingredient.slot}`}
                                  className="flex min-w-36 items-center gap-2 rounded-lg bg-muted/45 p-2"
                                >
                                  <ItemIcon
                                    itemId={ingredient.item_id}
                                    testId="recipe-ingredient-icon"
                                    size={36}
                                  />
                                  <span className="min-w-0 truncate text-sm font-medium">
                                    {ingredient.name}
                                  </span>
                                  <span className="ml-auto text-sm font-semibold tabular-nums">
                                    ×{ingredient.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        {t("noRecipe")}
                      </p>
                    )}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
