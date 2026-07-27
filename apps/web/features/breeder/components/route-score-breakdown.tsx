"use client";

import type { BreedingRoute } from "@palhatch/contracts";
import { Calculator, ChevronDown, Info } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { optimizationModeLabels, scoreComponentLabels } from "../presentation";

export function RouteScoreBreakdown({
  route,
}: Readonly<{ route: BreedingRoute }>) {
  const [open, setOpen] = useState(false);
  const selectedModeScore = route.score_breakdown.mode_scores.find(
    (score) => score.optimization_mode === route.optimization_mode,
  );

  return (
    <section
      className="min-w-0 rounded-3xl border border-glass-border bg-glass shadow-soft backdrop-blur-md"
      aria-label="推荐依据"
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex min-w-0 items-center gap-3 p-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-primary">
            <Calculator aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-foreground">推荐依据</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {optimizationModeLabels[route.optimization_mode]} · 总分{" "}
              {route.total_score.toFixed(2)}
            </p>
          </div>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={open ? "收起推荐依据" : "展开推荐依据"}
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
          <div className="border-t border-border px-4 py-5 sm:px-5">
            <h4 className="font-bold text-foreground">各项得分</h4>
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50/82 p-3 text-xs leading-5 text-sky-950">
              <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>尝试区间与难度来自策略启发式，不是已验证的遗传概率。</p>
            </div>

            <div className="mt-4 grid min-w-0 gap-2">
              <div
                className="hidden grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-3 text-xs font-semibold text-muted-foreground sm:grid"
                aria-hidden="true"
              >
                <span>参考项</span>
                <span>基础分 × 权重</span>
                <span>得分</span>
              </div>
              {selectedModeScore?.components.map((component) => (
                <div
                  className="grid min-w-0 gap-2 rounded-2xl border border-border bg-white/72 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3"
                  key={component.component}
                >
                  <span className="font-semibold text-foreground">
                    {scoreComponentLabels[component.component]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {component.normalized_score.toFixed(1)} ×{" "}
                    {component.weight.toFixed(2)}
                  </span>
                  <strong className="text-primary tabular-nums">
                    {component.weighted_score.toFixed(2)}
                  </strong>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {route.score_breakdown.mode_scores.map((score) => (
                <Badge
                  variant="outline"
                  className="border-border bg-white/78 text-foreground"
                  key={score.optimization_mode}
                >
                  {optimizationModeLabels[score.optimization_mode]}：
                  {score.total_score.toFixed(2)}
                </Badge>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
