"use client";

import type { PalInventoryPage } from "@palhatch/contracts";
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  LayoutGrid,
  List,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  GenderDisplay,
  type DisplayGender,
} from "@/components/pals/gender-display";
import type { PalInventoryView, PalListQuery } from "./query";

const scopes = [
  ["all", "全部"],
  ["mine", "我的帕鲁"],
  ["shared", "公会共享"],
] as const;

const genderLabels = {
  male: "雄性",
  female: "雌性",
  genderless: "无性别",
  unknown: "未知",
} as const;

const locationLabels = {
  player_party: "队伍",
  player_storage: "终端",
  base: "据点",
  dimensional_storage: "次元仓库",
  viewing_cage: "观赏笼",
  unknown: "未知",
} as const;

type FilterOption = {
  value: string;
  label: string;
  gender?: DisplayGender;
};

function scopeHref(scope: string, query: PalListQuery): string {
  const params = new URLSearchParams({ scope });
  if (query.query) params.set("query", query.query);
  if (query.owner) params.set("owner", query.owner);
  if (query.gender) params.set("gender", query.gender);
  if (query.passive) params.set("passive", query.passive);
  if (query.location) params.set("location", query.location);
  if (query.shared !== null) params.set("shared", String(query.shared));
  if (query.page_size !== 24) params.set("page_size", String(query.page_size));
  if (query.view !== "cards") params.set("view", query.view);
  return `/pals?${params.toString()}`;
}

function resetHref(query: PalListQuery): string {
  const params = new URLSearchParams({ scope: query.scope });
  if (query.page_size !== 24) params.set("page_size", String(query.page_size));
  if (query.view !== "cards") params.set("view", query.view);
  return `/pals?${params.toString()}`;
}

function ViewToggle({
  view,
  viewHrefs,
}: Readonly<{
  view: PalInventoryView;
  viewHrefs: Readonly<Record<PalInventoryView, string>>;
}>) {
  return (
    <TooltipProvider>
      <div
        className="flex items-center overflow-hidden rounded-lg border border-input bg-background shadow-xs"
        aria-label="库存展示形式"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={viewHrefs.cards}
              aria-label="卡片视图"
              aria-current={view === "cards" ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "rounded-none",
                view === "cards" &&
                  "bg-accent text-accent-foreground shadow-xs",
              )}
            >
              <LayoutGrid aria-hidden="true" className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top">卡片视图</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={viewHrefs.table}
              aria-label="表格视图"
              aria-current={view === "table" ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon" }),
                "rounded-none",
                view === "table" &&
                  "bg-accent text-accent-foreground shadow-xs",
              )}
            >
              <List aria-hidden="true" className="size-4" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top">表格视图</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function FilterSelect({
  id,
  name,
  label,
  emptyLabel,
  initialValue,
  options,
}: Readonly<{
  id: string;
  name: string;
  label: string;
  emptyLabel: string;
  initialValue: string;
  options: FilterOption[];
}>) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value || "__all__"}
        onValueChange={(nextValue) =>
          setValue(nextValue === "__all__" ? "" : nextValue)
        }
      >
        <SelectTrigger id={id} className="w-full bg-white/82">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          <SelectItem value="__all__">{emptyLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.gender === undefined ? (
                option.label
              ) : (
                <GenderDisplay gender={option.gender} label={option.label} />
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PassiveCombobox({
  id,
  initialValue,
  options,
}: Readonly<{
  id: string;
  initialValue: string;
  options: FilterOption[];
}>) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue);
  const selected = options.find((option) => option.value === value);

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        被动
      </Label>
      <input type="hidden" name="passive" value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between bg-white/82 px-3 font-normal"
          >
            <span className="truncate">{selected?.label ?? "全部被动"}</span>
            <ChevronsUpDown
              aria-hidden="true"
              className="size-4 shrink-0 opacity-50"
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,var(--radix-popover-content-available-width))] p-0"
        >
          <Command>
            <CommandInput placeholder="搜索被动名称" />
            <CommandList>
              <CommandEmpty>没有匹配的被动</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="全部被动"
                  onSelect={() => {
                    setValue("");
                    setOpen(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      value === "" ? "opacity-100" : "opacity-0",
                    )}
                  />
                  全部被动
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      setValue(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "size-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FilterFields({
  query,
  page,
  viewHrefs,
}: Readonly<{
  query: PalListQuery;
  page: PalInventoryPage;
  viewHrefs: Readonly<Record<PalInventoryView, string>>;
}>) {
  const genders = page.filter_options.genders.map((value) => ({
    value,
    label: genderLabels[value],
    gender: value,
  }));
  const locations = page.filter_options.locations.map((value) => ({
    value,
    label: locationLabels[value],
  }));

  return (
    <form action="/pals" method="get" className="grid gap-4">
      <input type="hidden" name="scope" value={query.scope} />
      {query.page_size !== 24 ? (
        <input type="hidden" name="page_size" value={query.page_size} />
      ) : null}
      {query.view !== "cards" ? (
        <input type="hidden" name="view" value={query.view} />
      ) : null}
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <Tabs value={query.scope} className="min-w-0 shrink-0">
          <TabsList
            role="navigation"
            aria-label="库存范围"
            className="grid w-full grid-cols-3 bg-accent/70 sm:w-auto"
          >
            {scopes.map(([scope, label]) => (
              <Link
                key={scope}
                href={scopeHref(scope, query)}
                aria-current={query.scope === scope ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-md px-3 text-sm font-semibold text-foreground/65 no-underline transition-colors hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                  query.scope === scope && "bg-white text-foreground shadow-sm",
                )}
              >
                {label}
              </Link>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end xl:ml-auto xl:justify-end">
          <div className="grid min-w-0 gap-1.5 sm:w-64 lg:w-72">
            <Label
              htmlFor="pal-filter-query"
              className="text-xs text-muted-foreground"
            >
              名称或图鉴编号
            </Label>
            <Input
              id="pal-filter-query"
              type="search"
              name="query"
              defaultValue={query.query}
              placeholder="棉悠悠 / 1"
              className="bg-white/82"
            />
          </div>
          <div className="min-w-0 sm:w-52">
            <PassiveCombobox
              id="pal-filter-passive"
              initialValue={query.passive}
              options={page.filter_options.passives}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button asChild variant="outline" className="px-3">
              <Link href={resetHref(query)}>清除</Link>
            </Button>
            <Button type="submit">应用筛选</Button>
            <ViewToggle view={query.view} viewHrefs={viewHrefs} />
          </div>
        </div>
      </div>

      <CollapsibleContent
        id="pal-advanced-filters"
        className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <FilterSelect
          id="pal-filter-owner"
          name="owner"
          label="所有者"
          emptyLabel="全部所有者"
          initialValue={query.owner}
          options={page.filter_options.owners}
        />
        <FilterSelect
          id="pal-filter-gender"
          name="gender"
          label="性别"
          emptyLabel="全部性别"
          initialValue={query.gender}
          options={genders}
        />
        <FilterSelect
          id="pal-filter-location"
          name="location"
          label="位置"
          emptyLabel="全部位置"
          initialValue={query.location}
          options={locations}
        />
        <FilterSelect
          id="pal-filter-shared"
          name="shared"
          label="共享状态"
          emptyLabel="全部状态"
          initialValue={query.shared === null ? "" : String(query.shared)}
          options={[
            { value: "true", label: "公会可用" },
            { value: "false", label: "仅自己" },
          ]}
        />
      </CollapsibleContent>
    </form>
  );
}

export function PalFilters({
  query,
  page,
  viewHrefs,
}: Readonly<{
  query: PalListQuery;
  page: PalInventoryPage;
  viewHrefs: Readonly<Record<PalInventoryView, string>>;
}>) {
  const activeAdvancedFilterCount = [
    query.owner,
    query.gender,
    query.location,
    query.shared,
  ].filter((value) => value !== "" && value !== null).length;
  const [advancedOpen, setAdvancedOpen] = useState(
    activeAdvancedFilterCount > 0,
  );

  return (
    <Collapsible
      open={advancedOpen}
      onOpenChange={setAdvancedOpen}
      className="grid gap-1.5"
    >
      <section
        className="rounded-3xl border border-glass-border bg-white/78 p-3 shadow-soft backdrop-blur-xl sm:p-4"
        aria-label="库存筛选"
      >
        <FilterFields query={query} page={page} viewHrefs={viewHrefs} />
      </section>

      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">还想缩小范围？</span>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-controls="pal-advanced-filters"
            className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            {advancedOpen ? "收起筛选" : "更多筛选"}
            {activeAdvancedFilterCount > 0 ? (
              <span className="text-xs">({activeAdvancedFilterCount})</span>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-3.5 transition-transform motion-reduce:transition-none",
                advancedOpen && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
    </Collapsible>
  );
}
