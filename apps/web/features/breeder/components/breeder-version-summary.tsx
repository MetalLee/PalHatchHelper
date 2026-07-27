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
  const [open, setOpen] = useState(false);
  const details = [
    ["库存数据", context.inventory_snapshot_id],
    ["游戏数据", context.game_data_version_id],
    ["数据校验值", context.game_data_content_hash],
    ["游戏内容", `${context.game_version} · Build ${context.game_build_id}`],
    ["计算方式", context.algorithm_version],
    ["推荐方式", context.scoring_profile_versions[mode]],
  ] as const;

  return (
    <aside
      className="min-w-0 rounded-3xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5"
      aria-label="本次计算依据"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-800">
            <Database aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">本次计算依据</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              将使用当前库存和游戏数据，创建后的结果不会随数据更新而改变。
            </p>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              库存 {compactIdentifier(context.inventory_snapshot_id)} · 游戏数据{" "}
              {compactIdentifier(context.game_data_version_id)}
            </p>
          </div>
        </div>

        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="mt-3 w-full justify-between text-primary"
            aria-label={open ? "收起详细信息" : "查看详细信息"}
          >
            {open ? "收起详细信息" : "查看详细信息"}
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
