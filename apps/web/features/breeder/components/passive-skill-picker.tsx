"use client";

import type { BreederFormContext } from "@palhatch/contracts";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PassiveBadge } from "@/components/pals/passive-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { userFacingCatalogName } from "@/lib/user-facing-name";

type PassiveOption = BreederFormContext["passive_skills"][number];

function PassiveMetadata({ skill }: Readonly<{ skill: PassiveOption }>) {
  const t = useCopy("Breeder");
  const displayName = userFacingCatalogName(
    skill.display_name,
    skill.passive_skill_id,
    t("nameUnavailable"),
  );
  const effectText = skill.effect_text?.trim() || t("effectUnavailable");
  return (
    <span className="grid min-w-0 gap-1.5">
      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
        <PassiveBadge
          name={displayName}
          rank={skill.rank}
          isNegative={skill.is_negative}
          className="breeder-option-passive-badge w-[min(20rem,100%)] justify-start truncate"
        />
      </span>
      <span className="line-clamp-2 text-sm leading-5 text-muted-foreground">
        {effectText}
      </span>
    </span>
  );
}

export function PassiveSkillPicker({
  skills,
  selectedIds,
  onToggle,
}: Readonly<{
  skills: BreederFormContext["passive_skills"];
  selectedIds: string[];
  onToggle: (id: string) => void;
}>) {
  const t = useCopy("Breeder");
  const [query, setQuery] = useState("");
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (normalized.length === 0) return skills;
    return skills.filter((skill) =>
      userFacingCatalogName(
        skill.display_name,
        skill.passive_skill_id,
        t("nameUnavailable"),
      )
        .toLocaleLowerCase("zh-CN")
        .includes(normalized),
    );
  }, [query, skills, t]);
  const selectedSkills = selectedIds.flatMap((id) => {
    const skill = skills.find((candidate) => candidate.passive_skill_id === id);
    return skill === undefined ? [] : [skill];
  });

  return (
    <div className="grid min-w-0 gap-4">
      <section
        className="grid min-w-0 gap-3 rounded-2xl border border-border bg-white/48 p-3 sm:p-4"
        aria-label={t("chosenPassivesLabel")}
        data-passive-layout="2x2"
      >
        <div className="flex min-w-0 items-center">
          <strong className="text-sm">
            {t("chosenCount", { count: selectedIds.length })}
          </strong>
        </div>
        {selectedSkills.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/80 px-3 py-2.5 text-sm text-muted-foreground">
            {t("noPassiveSelected")}
          </p>
        ) : (
          <div className="grid min-w-0 auto-rows-min grid-cols-[repeat(2,minmax(0,20rem))] content-start items-start justify-start gap-2">
            {selectedSkills.map((skill) => (
              <button
                type="button"
                key={skill.passive_skill_id}
                aria-label={t("removePassive", {
                  name: userFacingCatalogName(
                    skill.display_name,
                    skill.passive_skill_id,
                    t("nameUnavailable"),
                  ),
                })}
                onClick={() => onToggle(skill.passive_skill_id)}
                className="group relative inline-flex h-11 min-w-0 w-full cursor-pointer items-center rounded-lg text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <PassiveBadge
                  name={userFacingCatalogName(
                    skill.display_name,
                    skill.passive_skill_id,
                    t("nameUnavailable"),
                  )}
                  rank={skill.rank}
                  isNegative={skill.is_negative}
                  className="breeder-selected-passive-badge h-7 w-full min-w-0 justify-start truncate pr-9 transition-[filter] group-hover:brightness-110"
                />
                <X
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 size-5 shrink-0 rounded-full bg-black/45 p-1 text-white drop-shadow-sm"
                />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="passive-search" className="text-sm font-semibold">
          {t("searchPassiveName")}
        </Label>
        <div className="relative min-w-0">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="passive-search"
            type="search"
            aria-label={t("searchPassive")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("filterPassive")}
            className="rounded-xl pl-9"
          />
        </div>
      </div>

      <ScrollArea
        className="h-72 rounded-2xl border border-border bg-white/66 p-2"
        aria-label={t("passivePickerLabel")}
      >
        {visibleSkills.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t("noPassiveMatch")}
          </p>
        ) : (
          <div className="grid min-w-0 gap-1 pr-3">
            {visibleSkills.map((skill) => {
              const selected = selectedIds.includes(skill.passive_skill_id);
              return (
                <button
                  type="button"
                  key={skill.passive_skill_id}
                  aria-label={`${t(
                    selected ? "removePassive" : "choosePassive",
                    {
                      name: userFacingCatalogName(
                        skill.display_name,
                        skill.passive_skill_id,
                        t("nameUnavailable"),
                      ),
                    },
                  )}, ${skill.effect_text?.trim() || t("effectUnavailable")}`}
                  aria-pressed={selected}
                  onClick={() => onToggle(skill.passive_skill_id)}
                  className={cn(
                    "grid min-h-16 min-w-0 cursor-pointer items-center rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                    selected
                      ? "border-primary/40 bg-primary/10 shadow-sm"
                      : "border-border/60 bg-white/45 hover:border-primary/25 hover:bg-accent/50",
                  )}
                >
                  <PassiveMetadata skill={skill} />
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
