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
    description: "兼顾配种代数、现有帕鲁、被动继承和借用数量。",
    icon: Sparkles,
  },
  {
    value: "fastest",
    label: "最快路线",
    description: "优先推荐配种代数更少、步骤更短的路线。",
    icon: Gauge,
  },
  {
    value: "highest_success",
    label: "最高成功率",
    description: "优先推荐被动更集中、预计更容易完成的路线。",
    icon: ShieldCheck,
  },
  {
    value: "least_borrowing",
    label: "最少借用",
    description: "优先使用你自己的帕鲁，尽量少向公会伙伴借用。",
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
      <legend className="mb-1 text-sm font-semibold text-foreground">
        优化模式
      </legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {optimizationModes.map((mode) => {
          const Icon = mode.icon;
          return (
            <label
              key={mode.value}
              className={cn(
                "relative grid min-h-32 min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] focus-within:ring-3 focus-within:ring-ring/40",
                value === mode.value
                  ? "border-primary/40 bg-primary/10 shadow-sm"
                  : "border-border bg-white/55 hover:border-primary/25 hover:bg-accent/50",
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
        偏好只影响推荐顺序，不会改变游戏中的配种关系。
      </p>
    </fieldset>
  );
}
