"use client";

import type {
  BreederFormContext,
  CreateBreedingJobRequest,
} from "@palhatch/contracts";
import { ChevronDown, Database, Fingerprint } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

function compactIdentifier(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function BreederVersionSummary({
  context,
  mode,
}: Readonly<{
  context: BreederFormContext;
  mode: CreateBreedingJobRequest["optimization_mode"];
}>) {
  const t = useCopy("Breeder");
  const [open, setOpen] = useState(false);
  const details = [
    [t("inventoryData"), context.inventory_snapshot_id],
    [t("gameData"), context.game_data_version_id],
    [t("contentHash"), context.game_data_content_hash],
    [
      t("gameContent"),
      `${context.game_version} · Build ${context.game_build_id}`,
    ],
    [t("algorithm"), context.algorithm_version],
    [t("scoring"), context.scoring_profile_versions[mode]],
  ] as const;

  return (
    <aside
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
      aria-label={t("calculationBasis")}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
            <Database aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">{t("calculationBasis")}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("calculationBasisDescription")}
            </p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {t("inventoryShort", {
                inventory: compactIdentifier(context.inventory_snapshot_id),
                gameData: compactIdentifier(context.game_data_version_id),
              })}
            </p>
          </div>
        </div>

        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full justify-between text-primary"
            aria-label={open ? t("collapseDetails") : t("viewDetails")}
          >
            {open ? t("collapseDetails") : t("viewDetails")}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform motion-reduce:transition-none",
                open && "rotate-180",
              )}
            />
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          <dl className="grid min-w-0 gap-2 border-t border-border pt-3">
            {details.map(([label, value]) => (
              <div
                key={label}
                className="grid min-w-0 gap-1 rounded-xl bg-white/62 p-3"
              >
                <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Fingerprint aria-hidden="true" className="size-3.5" />
                  {label}
                </dt>
                <dd
                  className="min-w-0 select-all break-all font-mono text-xs leading-5 text-foreground"
                  title={value}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}
