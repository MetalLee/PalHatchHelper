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
import { cn } from "@/lib/utils";

function catalogNumber(value: number | null): string {
  return value === null ? "图鉴编号未知" : `#${String(value).padStart(3, "0")}`;
}

export function TargetPalCombobox({
  pals,
  value,
  onValueChange,
}: Readonly<{
  pals: BreederCatalogPalOption[];
  value: string;
  onValueChange: (palId: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const selected = pals.find((pal) => pal.pal_id === value);

  return (
    <div className="grid min-w-0 gap-3">
      <Label htmlFor="target-pal-combobox" className="font-semibold">
        目标 Pal（名称、编号或 Stable ID）
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id="target-pal-combobox"
            type="button"
            variant="outline"
            role="combobox"
            aria-label="目标 Pal（名称、编号或 Stable ID）"
            aria-expanded={open}
            className="h-auto min-h-12 w-full min-w-0 justify-between bg-white/82 px-3 py-2.5 text-left font-normal"
          >
            {selected === undefined ? (
              <span className="truncate text-muted-foreground">
                搜索名称、图鉴编号或 Stable ID
              </span>
            ) : (
              <span className="min-w-0">
                <span className="block truncate font-semibold text-foreground">
                  {selected.display_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {catalogNumber(selected.encyclopedia_no)} · {selected.pal_id}
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
          className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
        >
          <Command label="搜索目标 Pal">
            <CommandInput
              aria-label="搜索目标 Pal"
              placeholder="输入名称、编号或 Stable ID"
            />
            <CommandList className="max-h-80">
              <CommandEmpty>没有匹配的目标 Pal</CommandEmpty>
              <CommandGroup aria-label="目标 Pal 候选">
                {pals.map((pal) => (
                  <CommandItem
                    key={pal.pal_id}
                    value={`${pal.display_name} ${pal.encyclopedia_no ?? ""} #${pal.encyclopedia_no ?? ""} ${pal.pal_id}`}
                    onSelect={() => {
                      onValueChange(pal.pal_id);
                      setOpen(false);
                    }}
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 py-2.5"
                  >
                    <PalPortrait
                      palId={pal.pal_id}
                      name={pal.display_name}
                      catalogNumber={pal.encyclopedia_no}
                      size={44}
                      className="size-11 rounded-xl"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {pal.display_name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {catalogNumber(pal.encyclopedia_no)} · {pal.pal_id}
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
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected === undefined ? null : (
        <section
          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4"
          aria-label="目标 Pal 摘要"
        >
          <PalPortrait
            palId={selected.pal_id}
            name={selected.display_name}
            catalogNumber={selected.encyclopedia_no}
            size={64}
            className="size-16 rounded-2xl"
          />
          <div className="min-w-0 self-center">
            <p className="font-bold text-foreground">{selected.display_name}</p>
            <p className="mt-1 text-sm font-semibold text-primary">
              {catalogNumber(selected.encyclopedia_no)}
            </p>
            <p
              className="mt-1 truncate font-mono text-xs text-muted-foreground"
              title={selected.pal_id}
            >
              {selected.pal_id}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
