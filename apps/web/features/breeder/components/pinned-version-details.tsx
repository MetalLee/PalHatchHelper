"use client";

import type { BreederOptimizationMode } from "@palhatch/contracts";
import { ChevronDown, Fingerprint, Pin } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

import { compactIdentifier } from "../presentation";

export function PinnedVersionDetails({
  inventorySnapshotId,
  gameDataVersionId,
  gameDataContentHash,
  algorithmVersion,
  scoringProfileVersion,
  optimizationMode,
  title,
}: Readonly<{
  inventorySnapshotId: string;
  gameDataVersionId: string;
  gameDataContentHash: string;
  algorithmVersion: string;
  scoringProfileVersion: string;
  optimizationMode?: BreederOptimizationMode;
  title?: string;
}>) {
  const t = useCopy("Breeder");
  const effectiveTitle = title ?? t("calculationBasis");
  const [open, setOpen] = useState(false);
  const details: [string, string][] = [
    [t("inventoryData"), inventorySnapshotId],
    [t("gameData"), gameDataVersionId],
    [t("checksum"), gameDataContentHash],
    [t("algorithm"), algorithmVersion],
    [t("scoring"), scoringProfileVersion],
  ];
  if (optimizationMode !== undefined) {
    details.push([t("routePreference"), t(optimizationMode)]);
  }

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass shadow-soft backdrop-blur-md"
      aria-label={effectiveTitle}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-800">
            <Pin aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground">{effectiveTitle}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {t("savedBasisDescription", {
                inventory: compactIdentifier(inventorySnapshotId, 12),
                gameData: compactIdentifier(gameDataVersionId, 12),
              })}
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={
                open
                  ? t("collapseNamed", { title: effectiveTitle })
                  : t("expandNamed", { title: effectiveTitle })
              }
              className="text-primary"
            >
              {open ? t("collapse") : t("expand")}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </Button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <dl className="grid min-w-0 gap-2 border-t border-border px-4 py-5 sm:grid-cols-2 sm:px-5">
            {details.map(([label, value]) => (
              <div
                key={label}
                className="min-w-0 rounded-2xl border border-border bg-white/72 p-3"
              >
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Fingerprint aria-hidden="true" className="size-3.5" />
                  {label}
                </dt>
                <dd className="mt-1 min-w-0 select-all break-all font-mono text-xs leading-5 text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
