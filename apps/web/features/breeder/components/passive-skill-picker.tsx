"use client";

import type { BreederFormContext } from "@palhatch/contracts";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { PassiveBadge } from "@/components/pals/passive-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type PassiveOption = BreederFormContext["passive_skills"][number];

function PassiveMetadata({ skill }: Readonly<{ skill: PassiveOption }>) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <PassiveBadge
        name={skill.display_name}
        rank={skill.rank}
        isNegative={skill.is_negative}
      />
      <Badge
        variant="outline"
        className={cn(
          "rounded-full",
          skill.is_negative
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-emerald-200 bg-emerald-50 text-emerald-800",
        )}
      >
        {skill.is_negative ? "负面" : "正面"}
      </Badge>
    </span>
  );
}

export function PassiveSkillPicker({
  skills,
  selectedIds,
  onToggle,
  onClear,
}: Readonly<{
  skills: BreederFormContext["passive_skills"];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}>) {
  const [query, setQuery] = useState("");
  const visibleSkills = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-CN");
    if (normalized.length === 0) return skills;
    return skills.filter(
      (skill) =>
        skill.display_name.toLocaleLowerCase("zh-CN").includes(normalized) ||
        skill.passive_skill_id.toLocaleLowerCase("en-US").includes(normalized),
    );
  }, [query, skills]);
  const selectedSkills = selectedIds.flatMap((id) => {
    const skill = skills.find((candidate) => candidate.passive_skill_id === id);
    return skill === undefined ? [] : [skill];
  });

  return (
    <fieldset className="grid min-w-0 gap-4">
      <legend className="font-semibold text-foreground">
        期望被动（0 至 4 个）
      </legend>

      <section
        className="grid min-w-0 gap-3 rounded-2xl border border-border bg-accent/35 p-3 sm:p-4"
        aria-label="已选择的被动"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <strong className="text-sm">已选择 {selectedIds.length} / 4</strong>
          {selectedIds.length === 0 ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="text-muted-foreground"
            >
              清空
            </Button>
          )}
        </div>
        {selectedSkills.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚未选择被动</p>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-2">
            {selectedSkills.map((skill) => (
              <button
                type="button"
                key={skill.passive_skill_id}
                aria-label={`移除${skill.display_name}`}
                onClick={() => onToggle(skill.passive_skill_id)}
                className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-white/80 px-2.5 py-1.5 text-left transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
              >
                <PassiveBadge
                  name={skill.display_name}
                  rank={skill.rank}
                  isNegative={skill.is_negative}
                  className="max-w-[13rem] truncate"
                />
                <X aria-hidden="true" className="size-3.5 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="passive-search">搜索被动名称或 Stable ID</Label>
        <div className="relative min-w-0">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="passive-search"
            type="search"
            aria-label="搜索被动"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选被动"
            className="pl-9"
          />
        </div>
      </div>

      <ScrollArea
        className="h-72 rounded-2xl border border-border bg-white/66 p-2"
        aria-label="被动技能选择"
      >
        {visibleSkills.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            没有匹配的被动
          </p>
        ) : (
          <div className="grid min-w-0 gap-1 pr-3">
            {visibleSkills.map((skill) => {
              const selected = selectedIds.includes(skill.passive_skill_id);
              return (
                <button
                  type="button"
                  key={skill.passive_skill_id}
                  aria-label={`${selected ? "移除" : "选择"}${skill.display_name}，${skill.is_negative ? "负面" : "正面"}`}
                  aria-pressed={selected}
                  onClick={() => onToggle(skill.passive_skill_id)}
                  className={cn(
                    "grid min-h-14 min-w-0 cursor-pointer gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                    selected
                      ? "border-primary/40 bg-primary/8"
                      : "border-transparent hover:border-border hover:bg-accent/55",
                  )}
                >
                  <PassiveMetadata skill={skill} />
                  <span
                    className="truncate font-mono text-[0.7rem] text-muted-foreground"
                    title={skill.passive_skill_id}
                  >
                    {skill.passive_skill_id}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </fieldset>
  );
}
