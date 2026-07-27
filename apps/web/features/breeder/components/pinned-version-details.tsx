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
import { cn } from "@/lib/utils";

import { compactIdentifier, optimizationModeLabels } from "../presentation";

export function PinnedVersionDetails({
  inventorySnapshotId,
  gameDataVersionId,
  gameDataContentHash,
  algorithmVersion,
  scoringProfileVersion,
  optimizationMode,
  title = "本次计算依据",
}: Readonly<{
  inventorySnapshotId: string;
  gameDataVersionId: string;
  gameDataContentHash: string;
  algorithmVersion: string;
  scoringProfileVersion: string;
  optimizationMode?: BreederOptimizationMode;
  title?: string;
}>) {
  const [open, setOpen] = useState(false);
  const details: [string, string][] = [
    ["库存数据", inventorySnapshotId],
    ["游戏数据", gameDataVersionId],
    ["校验信息", gameDataContentHash],
    ["计算方式", algorithmVersion],
    ["推荐方式", scoringProfileVersion],
  ];
  if (optimizationMode !== undefined) {
    details.push(["方案偏好", optimizationModeLabels[optimizationMode]]);
  }

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass shadow-soft backdrop-blur-md"
      aria-label={title}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-800">
            <Pin aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground">{title}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              保存时使用的库存与游戏数据 ·{" "}
              <span className="font-mono">
                {compactIdentifier(inventorySnapshotId, 12)} ·{" "}
                {compactIdentifier(gameDataVersionId, 12)}
              </span>
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={open ? `收起${title}` : `展开${title}`}
              className="text-primary"
            >
              {open ? "收起" : "展开"}
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
