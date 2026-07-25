import type { PalInventoryPage } from "@palhatch/contracts";
import { Crown } from "lucide-react";

import { GenderMarker } from "@/components/pals/gender-display";
import { PalElementIcons } from "@/components/pals/pal-element-icons";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type PalInventoryItem = PalInventoryPage["items"][number];

function catalogNumber(value: number | null): string {
  return value === null ? "图鉴编号未知" : `#${String(value).padStart(3, "0")}`;
}

export function PalIdentity({
  pal,
  portraitSize = 56,
  compact = false,
}: Readonly<{
  pal: PalInventoryItem;
  portraitSize?: number;
  compact?: boolean;
}>) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PalPortrait
        palId={pal.pal_id}
        name={pal.pal_display_name}
        catalogNumber={pal.encyclopedia_no}
        size={portraitSize}
        className={cn(compact ? "size-11 rounded-xl" : "size-14 rounded-xl")}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {compact ? (
            <span className="truncate text-sm font-bold tracking-tight text-foreground">
              {pal.pal_display_name}
            </span>
          ) : (
            <h2 className="truncate text-base font-bold tracking-tight text-foreground">
              {pal.pal_display_name}
            </h2>
          )}
          <PalElementIcons
            elementTypes={pal.element_types}
            size={compact ? 16 : 18}
          />
          <GenderMarker
            gender={pal.gender}
            iconClassName={compact ? "size-3.5" : "size-4"}
          />
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-primary">
            {catalogNumber(pal.encyclopedia_no)}
          </span>
          <span className="text-muted-foreground">Lv. {pal.level ?? "—"}</span>
          {pal.is_boss === true ? (
            <Badge
              variant="outline"
              className="h-5 gap-1 rounded-full border-amber-300 bg-amber-50 px-1.5 text-[0.65rem] text-amber-900"
            >
              <Crown aria-hidden="true" className="size-3" />
              头目
            </Badge>
          ) : null}
        </div>
        {pal.catalog_entry_state === "resolved" ? null : (
          <p className="mt-1 text-[0.68rem] font-medium text-amber-800">
            未解析目录项
          </p>
        )}
      </div>
    </div>
  );
}
