"use client";

import { Box, MapPin, Sparkles, UserRound } from "lucide-react";

import { GenderDisplay } from "@/components/pals/gender-display";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { palLocationText } from "@/components/pals/pal-location";
import { Badge } from "@/components/ui/badge";
import { useAppLocale, useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

import type {
  BreedingTreeEntity,
  BreedingTreeOccurrence,
  BreedingTreePassive,
} from "../lib/build-breeding-tree";
import { compactIdentifier, localizedName } from "../presentation";

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
  compactPreview = false,
  className,
}: Readonly<{
  entity: BreedingTreeEntity;
  occurrence: BreedingTreeOccurrence;
  roleLabel: string;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  overlay?: BreedingTreeNodeOverlay;
  compactPreview?: boolean;
  className?: string;
}>) {
  const locale = useAppLocale();
  const t = useCopy("Breeder");
  const genderText =
    entity.gender === "male"
      ? t("male")
      : entity.gender === "female"
        ? t("female")
        : entity.gender === "genderless"
          ? t("genderless")
          : t("unknownGender");
  const palName =
    entity.displayNameOverride ??
    localizedName(palNames, entity.palId, t("targetFallback"));
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
        "relative flex min-w-0 flex-col border shadow-sm",
        compactPreview ? "rounded-2xl p-3" : "rounded-3xl p-4",
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
      data-density={compactPreview ? "compact" : "comfortable"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <PalPortrait
          palId={entity.palId}
          name={palName}
          size={compactPreview ? 44 : 52}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-[0.12em] text-primary uppercase">
            {roleLabel}
          </p>
          <h3 className="mt-1 break-words text-base font-bold text-foreground">
            {palName}
          </h3>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-wrap gap-1.5",
          compactPreview ? "mt-2" : "mt-3",
        )}
      >
        <SourceBadge entity={entity} />
        {overlay ? <StepStateBadge overlay={overlay} /> : null}
        <Badge
          variant="outline"
          className="border-border bg-white/78 text-foreground"
        >
          <GenderDisplay gender={entity.gender} label={genderText} />
        </Badge>
        {entity.recipeType === "special" ? (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-50 text-amber-900"
          >
            {t("specialRecipe")}
          </Badge>
        ) : null}
        {entity.existingTargetInstanceUid !== null ? (
          <Badge
            variant="outline"
            className="border-violet-200 bg-violet-50 text-violet-800"
          >
            {t("existingTargetBadge")}
          </Badge>
        ) : null}
      </div>

      {entity.kind === "missing" ? (
        <div className="mt-3 grid gap-1 rounded-2xl bg-white/72 p-3 text-xs leading-5 text-orange-950">
          <p>
            <strong>{t("missingSpecies")}</strong>
            {palName}
          </p>
          <p>
            <strong>{t("requiredGender")}</strong>
            <GenderDisplay gender={entity.gender} label={genderText} />
          </p>
          <p>
            <strong>{t("requiredPassives")}</strong>
            {requiredPassives.length === 0
              ? t("noPassiveRequired")
              : requiredPassives
                  .map((passive) =>
                    localizedName(
                      passiveNames,
                      passive.passiveId,
                      t("passiveFallback"),
                    ),
                  )
                  .join(t("listSeparator"))}
          </p>
          <p>{t("noInventoryInstance")}</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
          <p className="flex min-w-0 items-start gap-2">
            <UserRound
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            <span className="min-w-0 break-words">
              {localizedOwner(entity.ownerDisplayName, t)}
            </span>
          </p>
          <p className="flex min-w-0 items-start gap-2">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-primary"
            />
            <span className="min-w-0 break-words">
              {locationText(entity, locale, t)}
            </span>
          </p>
          {entity.instanceUid !== null && !compactPreview ? (
            <p className="flex min-w-0 items-start gap-2">
              <Box
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-primary"
              />
              <span className="min-w-0 break-all font-mono">
                {t("instance", { id: compactIdentifier(entity.instanceUid) })}
              </span>
            </p>
          ) : null}
          {entity.existingTargetInstanceUid !== null &&
          !compactPreview &&
          entity.instanceUid === null ? (
            <p className="flex min-w-0 items-start gap-2">
              <Box
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-primary"
              />
              <span className="min-w-0 break-all font-mono">
                {t("existingTargetInstance", {
                  id: compactIdentifier(entity.existingTargetInstanceUid),
                })}
              </span>
            </p>
          ) : null}
        </div>
      )}

      {entity.kind === "missing" ? (
        <PassiveList
          label={t("requiredPassives")}
          passives={entity.requiredPassives}
          passiveNames={passiveNames}
        />
      ) : null}
      {showActualPassives ? (
        <PassiveList
          label={t("inventoryPassives")}
          passives={entity.passives}
          passiveNames={passiveNames}
        />
      ) : null}
      {!showActualPassives && entity.kind !== "missing" ? (
        <PassiveList
          label={entity.isTarget ? t("targetPassives") : t("retainedPassives")}
          passives={
            entity.requiredPassives.length > 0
              ? entity.requiredPassives
              : entity.passives
          }
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
  const t = useCopy("Breeder");
  if (entity.kind === "missing") {
    return (
      <Badge
        variant="outline"
        className="border-orange-300 bg-orange-100 text-orange-900"
      >
        {t("missing")}
      </Badge>
    );
  }
  if (entity.kind === "target") {
    return (
      <Badge className="bg-violet-600 text-white hover:bg-violet-600">
        {t("target")}
      </Badge>
    );
  }
  if (entity.kind === "existing_target") {
    return (
      <Badge
        variant="outline"
        className="border-violet-200 bg-violet-50 text-violet-800"
      >
        {t("existingTarget")}
      </Badge>
    );
  }
  if (entity.kind === "intermediate") {
    return (
      <Badge
        variant="outline"
        className="border-sky-200 bg-sky-50 text-sky-800"
      >
        {t("intermediate")}
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
      {entity.borrowed ? t("guildBorrowed") : t("inventoryAvailable")}
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
  const t = useCopy("Breeder");
  const fixedGrid = new Set([
    t("inventoryPassives"),
    t("retainedPassives"),
    t("targetPassives"),
  ]).has(label);

  return (
    <div className="mt-3 border-t border-border/80 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-3.5 text-primary" />
        {label}
      </p>
      {passives.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("noProvidedPassives")}
        </p>
      ) : (
        <div
          className={cn(
            "mt-2 grid auto-rows-min grid-cols-2 content-start items-start gap-1.5 self-start",
          )}
          data-passive-layout={fixedGrid ? "2x2" : undefined}
        >
          {passives.map((passive) => (
            <PassiveBadge
              key={passive.passiveId}
              name={localizedName(
                passiveNames,
                passive.passiveId,
                t("passiveFallback"),
              )}
              rank={passive.rank}
              isNegative={passive.isNegative}
              className="w-full min-w-0 justify-start truncate whitespace-nowrap"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function locationText(
  entity: BreedingTreeEntity,
  locale: "zh" | "en",
  t: ReturnType<typeof useCopy<"Breeder">>,
): string {
  if (
    (entity.kind === "intermediate" || entity.kind === "target") &&
    entity.instanceUid === null
  ) {
    return entity.isTarget ? t("producedByFinal") : t("producedByPrevious");
  }
  if (entity.locationType !== null) {
    return palLocationText(
      {
        location_type: entity.locationType,
        location_name: entity.locationName,
        location_slot_index: entity.locationSlotIndex,
      },
      locale,
    );
  }
  return t("locationUnavailable");
}

function localizedOwner(
  value: string,
  t: ReturnType<typeof useCopy<"Breeder">>,
): string {
  if (value === "__ROUTE_FINAL_TARGET__") return t("routeFinalTargetOwner");
  if (value === "__EXISTING_TARGET_INSTANCE__") {
    return t("existingTargetOwner");
  }
  if (value.startsWith("__ROUTE_INTERMEDIATE__:")) {
    return t("routeIntermediateOwner", {
      step: value.slice("__ROUTE_INTERMEDIATE__:".length),
    });
  }
  return value || t("ownerUnavailable");
}
