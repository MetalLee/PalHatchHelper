import type { PalInventoryPage } from "@palhatch/contracts";

import { PassiveBadge } from "@/components/pals/passive-badge";
import { cn } from "@/lib/utils";

type PalInventoryItem = PalInventoryPage["items"][number];

export function PalPassiveList({
  pal,
  passiveRanks,
  className,
}: Readonly<{
  pal: PalInventoryItem;
  passiveRanks: Readonly<Record<string, number>>;
  className?: string;
}>) {
  return (
    <div
      className={cn("flex min-h-7 flex-wrap gap-1.5", className)}
      aria-label="被动技能"
    >
      {pal.passive_display_names.length > 0 ? (
        pal.passive_display_names.map((passive, index) => {
          const passiveId = pal.passive_skill_ids[index] ?? "";
          const isUnknown = pal.unknown_passive_skill_ids.includes(passiveId);
          return (
            <PassiveBadge
              key={`${passiveId}-${index}`}
              name={isUnknown ? `未知被动 · ${passive}` : passive}
              rank={isUnknown ? null : (passiveRanks[passiveId] ?? null)}
            />
          );
        })
      ) : (
        <span className="text-xs text-muted-foreground">无被动词条</span>
      )}
    </div>
  );
}
