"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppLocale, useCopy } from "@/i18n/client";

import { ITEM_PAGE_SIZES, type ItemInventoryQuery } from "./query";

export function ItemInventoryFilters({
  query,
}: Readonly<{ query: ItemInventoryQuery }>) {
  const locale = useAppLocale();
  const t = useCopy("Items");

  return (
    <form
      action={`/${locale}/items`}
      method="get"
      className="grid min-w-0 gap-3 sm:grid-cols-[minmax(14rem,1fr)_12rem_10rem_auto] sm:items-center"
    >
      <div className="relative min-w-0">
        <Label htmlFor="item-filter-query" className="sr-only">
          {t("searchLabel")}
        </Label>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="item-filter-query"
          name="query"
          type="search"
          defaultValue={query.query}
          placeholder={t("searchPlaceholder")}
          className="bg-white/82 pl-9"
        />
      </div>

      <div className="min-w-0">
        <Label htmlFor="item-filter-type" className="sr-only">
          {t("typeLabel")}
        </Label>
        <Select name="type" defaultValue={query.type}>
          <SelectTrigger
            id="item-filter-type"
            aria-label={t("typeLabel")}
            className="w-full bg-white/82"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">{t("allTypes")}</SelectItem>
            <SelectItem value="material">{t("materials")}</SelectItem>
            <SelectItem value="food">{t("foods")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0">
        <Label htmlFor="item-filter-page-size" className="sr-only">
          {t("pageSize")}
        </Label>
        <Select name="page_size" defaultValue={String(query.pageSize)}>
          <SelectTrigger
            id="item-filter-page-size"
            aria-label={t("pageSize")}
            className="w-full bg-white/82"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {ITEM_PAGE_SIZES.map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {t("pageSizeValue", { count: pageSize })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" className="w-full sm:w-auto">
        {t("apply")}
      </Button>
    </form>
  );
}
