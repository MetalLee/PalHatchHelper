"use client";

import type { BreederCatalogPalOption } from "@palhatch/contracts";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { userFacingCatalogName } from "@/lib/user-facing-name";

export function TargetPalCombobox({
  pals,
  value,
  onValueChange,
}: Readonly<{
  pals: BreederCatalogPalOption[];
  value: string;
  onValueChange: (palId: string) => void;
}>) {
  const t = useCopy("Breeder");
  const catalogNumber = (catalogValue: number | null) =>
    catalogValue === null
      ? t("catalogUnknown")
      : `#${String(catalogValue).padStart(3, "0")}`;
  const [open, setOpen] = useState(false);
  const selected = pals.find((pal) => pal.pal_id === value);
  const selectedName =
    selected === undefined
      ? null
      : userFacingCatalogName(
          selected.display_name,
          selected.pal_id,
          t("nameUnavailable"),
        );

  return (
    <div className="grid min-w-0 gap-2">
      <Label
        htmlFor="target-pal-combobox"
        className="text-sm font-semibold text-foreground"
      >
        {t("targetPal")}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="target-pal-combobox"
            type="button"
            variant="outline"
            role="combobox"
            aria-label={t("targetPal")}
            aria-expanded={open}
            className={cn(
              "h-auto w-full min-w-0 justify-between rounded-xl border-border bg-white/72 px-3 text-left font-normal hover:border-primary/25 hover:bg-accent/45",
              selected === undefined ? "min-h-14 py-2" : "min-h-24 py-3",
            )}
          >
            {selected === undefined ? (
              <span className="truncate text-muted-foreground">
                {t("searchTarget")}
              </span>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <PalPortrait
                  palId={selected.pal_id}
                  name={selectedName ?? t("nameUnavailable")}
                  catalogNumber={selected.encyclopedia_no}
                  size={72}
                  className="size-18 rounded-2xl ring-2 ring-primary/15"
                />
                <span className="min-w-0">
                  <span className="block truncate text-lg font-bold tracking-tight text-foreground">
                    {selectedName}
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold text-primary">
                    {catalogNumber(selected.encyclopedia_no)}
                  </span>
                </span>
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
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] rounded-xl p-0"
        >
          <Command label={t("searchTargetLabel")} className="rounded-xl">
            <CommandInput
              aria-label={t("searchTargetLabel")}
              placeholder={t("searchTargetPlaceholder")}
            />
            <CommandList className="max-h-80">
              <CommandEmpty>{t("noTargetMatch")}</CommandEmpty>
              <CommandGroup aria-label={t("targetCandidates")}>
                {pals.map((pal) => {
                  const displayName = userFacingCatalogName(
                    pal.display_name,
                    pal.pal_id,
                    t("nameUnavailable"),
                  );
                  return (
                    <CommandItem
                      key={pal.pal_id}
                      value={`${displayName} ${pal.encyclopedia_no ?? ""} #${pal.encyclopedia_no ?? ""}`}
                      onSelect={() => {
                        onValueChange(pal.pal_id);
                        setOpen(false);
                      }}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-xl py-2.5"
                    >
                      <PalPortrait
                        palId={pal.pal_id}
                        name={displayName}
                        catalogNumber={pal.encyclopedia_no}
                        size={44}
                        className="size-11 rounded-xl"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {displayName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {catalogNumber(pal.encyclopedia_no)}
                        </span>
                      </span>
                      <Check
                        aria-hidden="true"
                        className={cn(
                          "size-4 text-primary",
                          value === pal.pal_id ? "opacity-100" : "opacity-0",
                        )}
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
