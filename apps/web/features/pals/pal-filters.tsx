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
import { useAppLocale, useCopy } from "@/i18n/client";
import { Link } from "@/i18n/navigation";

import {
  GenderDisplay,
  type DisplayGender,
} from "@/components/pals/gender-display";
import { PassiveBadge } from "@/components/pals/passive-badge";
import type { PalInventoryView, PalListQuery } from "./query";

const scopes = [
  ["all", "all"],
  ["mine", "mine"],
  ["shared", "guildShared"],
] as const;

const genderLabels = {
  male: "male",
  female: "female",
  genderless: "genderless",
  unknown: "unknown",
} as const;

const locationLabels = {
  player_party: "party",
  player_storage: "storage",
  base: "base",
  dimensional_storage: "dimensionalStorage",
  viewing_cage: "viewingCage",
  unknown: "unknown",
} as const;

type FilterOption = {
  value: string;
  label: string;
  gender?: DisplayGender;
};

type PassiveFilterOption =
  PalInventoryPage["filter_options"]["passives"][number];

function orderPassiveOptions(
  options: readonly PassiveFilterOption[],
): PassiveFilterOption[] {
  return [...options].sort(
    (left, right) =>
      right.rank - left.rank || left.value.localeCompare(right.value),
  );
}

function scopeHref(scope: string, query: PalListQuery): string {
  const params = new URLSearchParams({ scope });
  if (query.query) params.set("query", query.query);
  if (query.owner) params.set("owner", query.owner);
  if (query.gender) params.set("gender", query.gender);
  for (const passive of query.passives) params.append("passive", passive);
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
  const t = useCopy("Pals");
  return (
    <TooltipProvider>
      <div
        className="flex items-center overflow-hidden rounded-lg border border-input bg-background shadow-xs"
        aria-label={t("viewLabel")}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={viewHrefs.cards}
              aria-label={t("cardView")}
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
          <TooltipContent side="top">{t("cardView")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href={viewHrefs.table}
              aria-label={t("tableView")}
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
          <TooltipContent side="top">{t("tableView")}</TooltipContent>
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
  initialValues,
  options,
}: Readonly<{
  id: string;
  initialValues: string[];
  options: PalInventoryPage["filter_options"]["passives"];
}>) {
  const t = useCopy("Pals");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() =>
    Array.from(new Set(initialValues)).sort().slice(0, 4),
  );
  const orderedOptions = orderPassiveOptions(options);
  const selectedOptions = orderedOptions.filter((option) =>
    value.includes(option.value),
  );

  function toggleValue(optionValue: string): void {
    setValue((current) => {
      if (current.includes(optionValue)) {
        return current.filter((item) => item !== optionValue);
      }
      if (current.length >= 4) return current;
      return [...current, optionValue].sort();
    });
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {t("passiveSkill")}
      </Label>
      {value.map((passive) => (
        <input key={passive} type="hidden" name="passive" value={passive} />
      ))}
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
            {value.length === 0 ? (
              <span className="truncate">{t("allPassives")}</span>
            ) : selectedOptions.length === 0 ? (
              <span className="truncate">
                {t("selectedPassives", { count: value.length })}
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                <PassiveBadge
                  name={selectedOptions[0]!.label}
                  rank={selectedOptions[0]!.rank}
                  isNegative={selectedOptions[0]!.is_negative}
                  className="min-h-6 min-w-0 py-0.5"
                />
                {value.length > 1 ? (
                  <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                    +{value.length - 1}
                  </span>
                ) : null}
              </span>
            )}
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
            <CommandInput placeholder={t("searchPassive")} />
            <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border/70 px-3 py-1.5 text-xs text-muted-foreground">
              <span>{t("selectionCount", { count: value.length })}</span>
              {value.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t("clearPassive")}
                  className="h-7 px-2 text-xs"
                  onClick={() => setValue([])}
                >
                  {t("clear")}
                </Button>
              ) : null}
            </div>
            <CommandList
              aria-label={t("passiveOptions")}
              aria-multiselectable="true"
            >
              <CommandEmpty>{t("noPassiveMatch")}</CommandEmpty>
              <CommandGroup>
                {orderedOptions.map((option) => {
                  const selected = value.includes(option.value);
                  const disabled = value.length >= 4 && !selected;
                  return (
                    <CommandItem
                      key={option.value}
                      value={option.label}
                      disabled={disabled}
                      aria-label={`${option.label}${selected ? t("selectedSuffix") : ""}`}
                      onSelect={() => toggleValue(option.value)}
                      className="gap-2"
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <PassiveBadge
                        name={option.label}
                        rank={option.rank}
                        isNegative={option.is_negative}
                        className="min-w-0"
                      />
                    </CommandItem>
                  );
                })}
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
  const locale = useAppLocale();
  const t = useCopy("Pals");
  const genders = page.filter_options.genders.map((value) => ({
    value,
    label: t(genderLabels[value]),
    gender: value,
  }));
  const locations = page.filter_options.locations.map((value) => ({
    value,
    label: t(locationLabels[value]),
  }));

  return (
    <form action={`/${locale}/pals`} method="get" className="grid gap-4">
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
            aria-label={t("scopeLabel")}
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
                {t(label)}
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
              {t("queryLabel")}
            </Label>
            <Input
              id="pal-filter-query"
              type="search"
              name="query"
              defaultValue={query.query}
              placeholder={t("queryPlaceholder")}
              className="bg-white/82"
            />
          </div>
          <div className="min-w-0 sm:w-52">
            <PassiveCombobox
              id="pal-filter-passive"
              initialValues={query.passives}
              options={page.filter_options.passives}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button asChild variant="outline" className="px-3">
              <Link href={resetHref(query)}>{t("reset")}</Link>
            </Button>
            <Button type="submit">{t("apply")}</Button>
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
          label={t("owner")}
          emptyLabel={t("allOwners")}
          initialValue={query.owner}
          options={page.filter_options.owners}
        />
        <FilterSelect
          id="pal-filter-gender"
          name="gender"
          label={t("gender")}
          emptyLabel={t("allGenders")}
          initialValue={query.gender}
          options={genders}
        />
        <FilterSelect
          id="pal-filter-location"
          name="location"
          label={t("location")}
          emptyLabel={t("allLocations")}
          initialValue={query.location}
          options={locations}
        />
        <FilterSelect
          id="pal-filter-shared"
          name="shared"
          label={t("sharing")}
          emptyLabel={t("allStatuses")}
          initialValue={query.shared === null ? "" : String(query.shared)}
          options={[
            { value: "true", label: t("shareEnabled") },
            { value: "false", label: t("shareDisabled") },
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
  const t = useCopy("Pals");
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
        aria-label={t("filterLabel")}
      >
        <FilterFields query={query} page={page} viewHrefs={viewHrefs} />
      </section>

      <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        <span className="hidden sm:inline">{t("narrowPrompt")}</span>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-controls="pal-advanced-filters"
            className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal aria-hidden="true" className="size-3.5" />
            {advancedOpen ? t("collapseFilters") : t("moreFilters")}
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
