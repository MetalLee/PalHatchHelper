"use client";

import type { CreateBreedingJobRequest } from "@palhatch/contracts";
import {
  Gauge,
  Route,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type OptimizationMode = CreateBreedingJobRequest["optimization_mode"];

export const optimizationModes: ReadonlyArray<{
  value: OptimizationMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "balanced",
    label: "综合推荐",
    description: "平衡路线长度、库存覆盖、被动集中度与借用成本。",
    icon: Sparkles,
  },
  {
    value: "fastest",
    label: "最快路线",
    description: "更偏向代数更少、执行链更短的合法路线。",
    icon: Gauge,
  },
  {
    value: "highest_success",
    label: "最高成功率",
    description: "更偏向被动集中、策略估计难度更低的路线。",
    icon: ShieldCheck,
  },
  {
    value: "least_borrowing",
    label: "最少借用",
    description: "更偏向使用自有库存，降低公会协作依赖。",
    icon: Route,
  },
];

export function optimizationModeLabel(value: OptimizationMode): string {
  return optimizationModes.find((mode) => mode.value === value)?.label ?? value;
}

export function OptimizationModePicker({
  value,
  onValueChange,
}: Readonly<{
  value: OptimizationMode;
  onValueChange: (value: OptimizationMode) => void;
}>) {
  return (
    <fieldset
      role="radiogroup"
      aria-label="优化模式"
      className="grid min-w-0 gap-3"
    >
      <legend className="mb-1 font-semibold text-foreground">优化模式</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {optimizationModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <label
              key={mode.value}
              className={cn(
                "relative grid min-h-32 min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] focus-within:ring-3 focus-within:ring-ring/40",
                value === mode.value
                  ? "border-primary/50 bg-primary/8 shadow-sm"
                  : "border-border bg-white/62 hover:border-primary/30 hover:bg-white/84",
              )}
            >
              <input
                type="radio"
                name="optimization-mode"
                value={mode.value}
                aria-label={mode.label}
                checked={value === mode.value}
                onChange={() => onValueChange(mode.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-xl",
                  value === mode.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground",
                )}
              >
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-foreground">
                  {mode.label}
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {mode.description}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        模式只调整确定性评分的倾向，不承诺精确遗传概率。
      </p>
    </fieldset>
  );
}
