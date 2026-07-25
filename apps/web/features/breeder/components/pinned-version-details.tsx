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
}: Readonly<{
  inventorySnapshotId: string;
  gameDataVersionId: string;
  gameDataContentHash: string;
  algorithmVersion: string;
  scoringProfileVersion: string;
  optimizationMode: BreederOptimizationMode;
}>) {
  const [open, setOpen] = useState(false);
  const versions = [
    ["库存快照", inventorySnapshotId],
    ["目录版本", gameDataVersionId],
    ["Content hash", gameDataContentHash],
    ["算法版本", algorithmVersion],
    ["评分版本", scoringProfileVersion],
    ["优化模式", optimizationModeLabels[optimizationMode]],
  ] as const;

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass shadow-soft backdrop-blur-md"
      aria-label="固定版本"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-sky-800">
            <Pin aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground">固定版本</h3>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              快照 {compactIdentifier(inventorySnapshotId, 18)} · 目录{" "}
              {compactIdentifier(gameDataVersionId, 18)}
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={open ? "收起固定版本" : "展开固定版本"}
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
            {versions.map(([label, value]) => (
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
