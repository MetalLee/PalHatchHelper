"use client";

import type { PalInventoryPage } from "@palhatch/contracts";
import { Check, ChevronsUpDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  GenderDisplay,
  type DisplayGender,
} from "@/components/pals/gender-display";
import type { PalListQuery } from "./query";

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
  idPrefix,
  query,
  page,
  mobile = false,
}: Readonly<{
  idPrefix: string;
  query: PalListQuery;
  page: PalInventoryPage;
  mobile?: boolean;
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
    <form
      action="/pals"
      method="get"
      className={cn(
        mobile
          ? "grid gap-4 px-4 pb-8"
          : "grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-[minmax(16rem,1.6fr)_repeat(5,minmax(8.5rem,1fr))_auto]",
      )}
    >
      <input type="hidden" name="scope" value={query.scope} />
      {query.page_size !== 24 ? (
        <input type="hidden" name="page_size" value={query.page_size} />
      ) : null}
      {query.view !== "cards" ? (
        <input type="hidden" name="view" value={query.view} />
      ) : null}
      <div className="grid min-w-0 gap-1.5 lg:col-span-2 xl:col-span-1">
        <Label
          htmlFor={`${idPrefix}-query`}
          className="text-xs text-muted-foreground"
        >
          名称或图鉴编号
        </Label>
        <Input
          id={`${idPrefix}-query`}
          type="search"
          name="query"
          defaultValue={query.query}
          placeholder="棉悠悠 / 1"
          className="bg-white/82"
        />
      </div>
      <FilterSelect
        id={`${idPrefix}-owner`}
        name="owner"
        label="所有者"
        emptyLabel="全部所有者"
        initialValue={query.owner}
        options={page.filter_options.owners}
      />
      <FilterSelect
        id={`${idPrefix}-gender`}
        name="gender"
        label="性别"
        emptyLabel="全部性别"
        initialValue={query.gender}
        options={genders}
      />
      <PassiveCombobox
        id={`${idPrefix}-passive`}
        initialValue={query.passive}
        options={page.filter_options.passives}
      />
      <FilterSelect
        id={`${idPrefix}-location`}
        name="location"
        label="位置"
        emptyLabel="全部位置"
        initialValue={query.location}
        options={locations}
      />
      <FilterSelect
        id={`${idPrefix}-shared`}
        name="shared"
        label="共享状态"
        emptyLabel="全部状态"
        initialValue={query.shared === null ? "" : String(query.shared)}
        options={[
          { value: "true", label: "公会可用" },
          { value: "false", label: "仅自己" },
        ]}
      />
      <div
        className={cn(
          "flex items-end gap-2",
          mobile
            ? "mt-2 grid grid-cols-2"
            : "col-span-2 lg:col-span-4 xl:col-span-1",
        )}
      >
        <Button
          asChild
          variant="outline"
          className={mobile ? "w-full" : "px-3"}
        >
          <Link href={resetHref(query)}>清除</Link>
        </Button>
        <Button type="submit" className={mobile ? "w-full" : ""}>
          应用筛选
        </Button>
      </div>
    </form>
  );
}

export function PalFilters({
  query,
  page,
}: Readonly<{ query: PalListQuery; page: PalInventoryPage }>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeFilterCount = [
    query.query,
    query.owner,
    query.gender,
    query.passive,
    query.location,
    query.shared,
  ].filter((value) => value !== "" && value !== null).length;

  return (
    <section
      className="rounded-3xl border border-glass-border bg-white/78 p-3 shadow-soft backdrop-blur-xl sm:p-4"
      aria-label="库存筛选"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <Tabs value={query.scope} className="min-w-0">
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

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="md:hidden"
              aria-label="筛选"
            >
              <SlidersHorizontal aria-hidden="true" className="size-4" />
              筛选
              {activeFilterCount > 0 ? (
                <span
                  aria-hidden="true"
                  className="grid size-5 place-items-center rounded-full bg-primary text-[0.65rem] text-primary-foreground"
                >
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[min(92vw,28rem)] overflow-y-auto bg-[image:var(--page-surface-gradient)] sm:max-w-md"
          >
            <SheetHeader className="pr-12">
              <SheetTitle>筛选库存</SheetTitle>
              <SheetDescription>
                应用后会保留当前选择的库存范围。
              </SheetDescription>
            </SheetHeader>
            <FilterFields
              idPrefix="mobile-pal-filter"
              query={query}
              page={page}
              mobile
            />
          </SheetContent>
        </Sheet>
      </div>

      <div
        className="mt-4 hidden md:block"
        aria-hidden={mobileOpen ? "true" : undefined}
      >
        <FilterFields idPrefix="desktop-pal-filter" query={query} page={page} />
      </div>
    </section>
  );
}
