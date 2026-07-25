import { Box, MapPin, Sparkles, UserRound } from "lucide-react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { palLocationText } from "@/components/pals/pal-location";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type {
  BreedingTreeEntity,
  BreedingTreeOccurrence,
  BreedingTreePassive,
} from "../lib/build-breeding-tree";
import { compactIdentifier, genderLabel, localizedName } from "../presentation";

export type BreedingTreeNodeTone =
  | "completed"
  | "current"
  | "pending"
  | "invalidated"
  | "candidate";

export interface BreedingTreeNodeOverlay {
  tone: BreedingTreeNodeTone;
  label: string;
  current?: boolean;
}

export function BreedingTreeNode({
  entity,
  occurrence,
  roleLabel,
  palNames,
  passiveNames,
  overlay,
  className,
}: Readonly<{
  entity: BreedingTreeEntity;
  occurrence: BreedingTreeOccurrence;
  roleLabel: string;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  overlay?: BreedingTreeNodeOverlay;
  className?: string;
}>) {
  const palName =
    entity.displayNameOverride ?? localizedName(palNames, entity.palId, "Pal");
  const requiredPassives = occurrence.requiredPassiveIds.map((passiveId) => {
    const actual = entity.passives.find(
      (passive) => passive.passiveId === passiveId,
    );
    const planned = entity.requiredPassives.find(
      (passive) => passive.passiveId === passiveId,
    );
    return (
      actual ??
      planned ?? {
        passiveId,
        rank: null,
        isNegative: null,
      }
    );
  });
  const showActualPassives =
    entity.kind === "inventory" || entity.kind === "existing_target";

  return (
    <article
      className={cn(
        "relative flex min-w-0 flex-col rounded-3xl border p-4 shadow-sm",
        entity.kind === "missing"
          ? "border-orange-300 bg-gradient-to-br from-orange-50 to-rose-50"
          : entity.isTarget
            ? "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-emerald-50"
            : entity.kind === "intermediate"
              ? "border-sky-200 bg-gradient-to-br from-sky-50 to-white"
              : "border-border bg-white/94",
        overlay?.tone === "completed" &&
          "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white",
        overlay?.tone === "current" &&
          "border-sky-400 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-md",
        overlay?.tone === "pending" &&
          "border-slate-200 bg-slate-50/82 opacity-75 shadow-none",
        overlay?.tone === "invalidated" &&
          "border-orange-400 bg-gradient-to-br from-orange-50 to-rose-50 shadow-md",
        overlay?.tone === "candidate" &&
          "border-violet-300 bg-gradient-to-br from-violet-50 via-white to-amber-50 shadow-md",
        overlay?.current && "ring-2 ring-primary/30 ring-offset-2",
        className,
      )}
      aria-label={`${roleLabel}：${palName}`}
      data-tree-node={entity.kind}
      data-entity-id={entity.id}
      data-occurrence-id={occurrence.id}
      data-plan-step-state={overlay?.tone}
      data-current-step={overlay?.current ? "true" : undefined}
    >
      <div className="flex min-w-0 items-start gap-3">
        <PalPortrait palId={entity.palId} name={palName} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {roleLabel}
          </p>
          <h3 className="mt-1 break-words text-base font-bold text-foreground">
            {palName}
          </h3>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <SourceBadge entity={entity} />
        {overlay ? <StepStateBadge overlay={overlay} /> : null}
        <Badge
          variant="outline"
          className="border-border bg-white/78 text-foreground"
        >
          {genderLabel(entity.gender)}
        </Badge>
        {entity.recipeType === "special" ? (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-900"
          >
            特殊配方
          </Badge>
        ) : null}
        {entity.existingTargetInstanceUid !== null ? (
          <Badge
            variant="outline"
            className="border-violet-200 bg-violet-50 text-violet-800"
          >
            当前库存已有目标
          </Badge>
        ) : null}
      </div>

      {entity.kind === "missing" ? (
        <div className="mt-3 grid gap-1 rounded-2xl bg-white/72 p-3 text-xs leading-5 text-orange-950">
          <p>
            <strong>缺少种类：</strong>
            {palName}
          </p>
          <p>
            <strong>所需性别：</strong>
            {genderLabel(entity.gender)}
          </p>
          <p>
            <strong>所需被动：</strong>
            {requiredPassives.length === 0
              ? "被动无要求"
              : requiredPassives
                  .map((passive) =>
                    localizedName(passiveNames, passive.passiveId, "被动"),
                  )
                  .join("、")}
          </p>
          <p>未绑定任何库存实例。</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
          <p className="flex min-w-0 items-start gap-2">
            <UserRound
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            <span className="min-w-0 break-words">
              {entity.ownerDisplayName || "所有者未提供"}
            </span>
          </p>
          <p className="flex min-w-0 items-start gap-2">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            <span className="min-w-0 break-words">{locationText(entity)}</span>
          </p>
          {entity.instanceUid !== null ? (
            <p className="flex min-w-0 items-start gap-2">
              <Box
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-primary"
              />
              <span className="min-w-0 break-all font-mono">
                实例 {compactIdentifier(entity.instanceUid)}
              </span>
            </p>
          ) : null}
          {entity.existingTargetInstanceUid !== null &&
          entity.instanceUid === null ? (
            <p className="flex min-w-0 items-start gap-2">
              <Box
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-primary"
              />
              <span className="min-w-0 break-all font-mono">
                现有目标实例{" "}
                {compactIdentifier(entity.existingTargetInstanceUid)}
              </span>
            </p>
          ) : null}
        </div>
      )}

      {entity.kind === "missing" ? (
        <PassiveList
          label="所需被动"
          passives={entity.requiredPassives}
          passiveNames={passiveNames}
        />
      ) : null}
      {showActualPassives ? (
        <PassiveList
          label="库存被动"
          passives={entity.passives}
          passiveNames={passiveNames}
        />
      ) : null}
      {!showActualPassives && entity.kind !== "missing" ? (
        <PassiveList
          label={entity.isTarget ? "目标被动" : "需保留被动"}
          passives={
            entity.requiredPassives.length > 0
              ? entity.requiredPassives
              : entity.passives
          }
          passiveNames={passiveNames}
        />
      ) : null}
      {showActualPassives && requiredPassives.length > 0 ? (
        <PassiveList
          label="本步骤需保留"
          passives={requiredPassives}
          passiveNames={passiveNames}
        />
      ) : null}
    </article>
  );
}

function StepStateBadge({
  overlay,
}: Readonly<{ overlay: BreedingTreeNodeOverlay }>) {
  const className = {
    completed: "border-emerald-200 bg-emerald-100 text-emerald-900",
    current: "border-sky-200 bg-sky-100 text-sky-900",
    pending: "border-slate-200 bg-slate-100 text-slate-700",
    invalidated: "border-orange-300 bg-orange-100 text-orange-950",
    candidate: "border-violet-200 bg-violet-100 text-violet-900",
  }[overlay.tone];

  return (
    <Badge variant="outline" className={className}>
      {overlay.label}
    </Badge>
  );
}

function SourceBadge({ entity }: Readonly<{ entity: BreedingTreeEntity }>) {
  if (entity.kind === "missing") {
    return (
      <Badge
        variant="outline"
        className="border-orange-300 bg-orange-100 text-orange-900"
      >
        缺失
      </Badge>
    );
  }
  if (entity.kind === "target") {
    return (
      <Badge className="bg-violet-600 text-white hover:bg-violet-600">
        目标
      </Badge>
    );
  }
  if (entity.kind === "existing_target") {
    return (
      <Badge
        variant="outline"
        className="border-violet-200 bg-violet-50 text-violet-800"
      >
        现有目标
      </Badge>
    );
  }
  if (entity.kind === "intermediate") {
    return (
      <Badge
        variant="outline"
        className="border-sky-200 bg-sky-50 text-sky-800"
      >
        中间产物
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={
        entity.borrowed
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }
    >
      {entity.borrowed ? "公会借用" : "库存可用"}
    </Badge>
  );
}

function PassiveList({
  label,
  passives,
  passiveNames,
}: Readonly<{
  label: string;
  passives: readonly BreedingTreePassive[];
  passiveNames: ReadonlyMap<string, string>;
}>) {
  return (
    <div className="mt-3 border-t border-border/80 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
        {label}
      </p>
      {passives.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">无已提供被动</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {passives.map((passive) => (
            <PassiveBadge
              key={passive.passiveId}
              name={localizedName(passiveNames, passive.passiveId, "被动")}
              rank={passive.rank}
              isNegative={passive.isNegative}
              showRank
              className="max-w-full whitespace-normal"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function locationText(entity: BreedingTreeEntity): string {
  if (
    (entity.kind === "intermediate" || entity.kind === "target") &&
    entity.instanceUid === null
  ) {
    return entity.isTarget ? "由本路线最终步骤产出" : "由前序步骤产出";
  }
  if (entity.locationType !== null) {
    return palLocationText({
      location_type: entity.locationType,
      location_name: entity.locationName,
      location_slot_index: entity.locationSlotIndex,
    });
  }
  return "位置未提供";
}
