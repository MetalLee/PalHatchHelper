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
import { cn } from "@/lib/utils";

function compactVersion(value: string): string {
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
  const [open, setOpen] = useState(false);
  const versions = [
    ["库存快照", context.inventory_snapshot_id],
    ["目录版本", context.game_data_version_id],
    ["Content hash", context.game_data_content_hash],
    ["Build", context.game_build_id],
    ["游戏版本", context.game_version],
    ["算法版本", context.algorithm_version],
    ["评分版本", context.scoring_profile_versions[mode]],
  ] as const;

  return (
    <aside
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
      aria-label="固定版本"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
            <Database aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">固定版本</p>
            <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted-foreground">
              <span>游戏 {context.game_version}</span>
              <span>Build {context.game_build_id}</span>
            </p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              快照 {compactVersion(context.inventory_snapshot_id)} · 目录{" "}
              {compactVersion(context.game_data_version_id)}
            </p>
          </div>
        </div>

        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full justify-between text-primary"
            aria-label={open ? "收起固定版本" : "查看固定版本"}
          >
            {open ? "收起完整版本" : "查看固定版本"}
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
            {versions.map(([label, value]) => (
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
