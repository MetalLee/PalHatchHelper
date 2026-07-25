import type {
  BreederOptimizationMode,
  BreedingJobDetailRpcSuccess,
} from "@palhatch/contracts";
import { Sparkles, Target } from "lucide-react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";

import { type BreedingTreePassiveFact } from "../lib/build-breeding-tree";
import {
  compactIdentifier,
  localizedName,
  optimizationModeLabels,
} from "../presentation";

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
  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-5 shadow-soft backdrop-blur-md sm:p-6"
      aria-label="配种目标摘要"
    >
      <div className="flex min-w-0 items-start gap-4">
        <PalPortrait palId={targetPalId} name={targetName} size={72} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-primary uppercase">
            <Target aria-hidden="true" className="size-4" />
            Breeding target
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {targetName}
          </h2>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {targetPalId}
          </p>
          <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground">
            任务 {compactIdentifier(jobId)}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          期望被动
        </h3>
        {desiredPassiveIds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">未指定期望被动</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {desiredPassiveIds.map((passiveId) => (
              <PassiveBadge
                key={passiveId}
                name={localizedName(passiveNames, passiveId, "被动")}
                rank={passiveFacts.get(passiveId)?.rank ?? null}
                isNegative={passiveFacts.get(passiveId)?.isNegative ?? null}
                showRank
                className="max-w-full whitespace-normal"
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <StatusChip tone="good">
          {optimizationModeLabels[optimizationMode]}
        </StatusChip>
        <StatusChip tone="neutral">最多 {maxGenerations} 代</StatusChip>
        <StatusChip tone={allowGuildShared ? "good" : "neutral"}>
          {allowGuildShared ? "允许公会共享" : "仅使用自有库存"}
        </StatusChip>
      </div>
    </section>
  );
}
