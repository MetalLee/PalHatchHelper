"use client";

import type {
  BreederOptimizationMode,
  BreedingJobDetailRpcSuccess,
} from "@palhatch/contracts";
import { Sparkles, Target } from "lucide-react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import { useCopy } from "@/i18n/client";

import { type BreedingTreePassiveFact } from "../lib/build-breeding-tree";
import { compactIdentifier, localizedName } from "../presentation";

export function BreedingJobTargetSummary({
  jobId,
  targetPalId,
  targetName,
  desiredPassiveIds,
  passiveNames,
  passiveFacts,
  optimizationMode,
  allowGuildShared,
  maxGenerations,
}: Readonly<{
  jobId: BreedingJobDetailRpcSuccess["data"]["job_id"];
  targetPalId: string;
  targetName: string;
  desiredPassiveIds: readonly string[];
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact>;
  optimizationMode: BreederOptimizationMode;
  allowGuildShared: boolean;
  maxGenerations: number;
}>) {
  const t = useCopy("Breeder");
  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
      aria-label={t("targetSummaryLabel")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <PalPortrait palId={targetPalId} name={targetName} size={64} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
            <Target aria-hidden="true" className="size-4" />
            {t("breedingTarget")}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            {targetName}
          </h2>
          <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
            {t("jobId", { id: compactIdentifier(jobId) })}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          {t("desiredPassives")}
        </h3>
        {desiredPassiveIds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("noneDesired")}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {desiredPassiveIds.map((passiveId) => (
              <PassiveBadge
                key={passiveId}
                name={localizedName(
                  passiveNames,
                  passiveId,
                  t("passiveFallback"),
                )}
                rank={passiveFacts.get(passiveId)?.rank ?? null}
                isNegative={passiveFacts.get(passiveId)?.isNegative ?? null}
                className="max-w-full whitespace-normal"
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <StatusChip tone="good">{t(optimizationMode)}</StatusChip>
        <StatusChip tone="neutral">
          {t("maxGenerations", { count: maxGenerations })}
        </StatusChip>
        <StatusChip tone={allowGuildShared ? "good" : "neutral"}>
          {allowGuildShared ? t("guildAllowed") : t("ownInventoryOnly")}
        </StatusChip>
      </div>
    </section>
  );
}
