"use client";

import type { CreateBreedingJobRequest } from "@palhatch/contracts";
import {
  Gauge,
  Route,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useCopy } from "@/i18n/client";
import { cn } from "@/lib/utils";

type OptimizationMode = CreateBreedingJobRequest["optimization_mode"];

const optimizationModeDefinitions: ReadonlyArray<{
  value: OptimizationMode;
  icon: LucideIcon;
}> = [
  {
    value: "balanced",
    icon: Sparkles,
  },
  {
    value: "fastest",
    icon: Gauge,
  },
  {
    value: "highest_success",
    icon: ShieldCheck,
  },
  {
    value: "least_borrowing",
    icon: Route,
  },
];

export function OptimizationModePicker({
  value,
  onValueChange,
}: Readonly<{
  value: OptimizationMode;
  onValueChange: (value: OptimizationMode) => void;
}>) {
  const t = useCopy("Breeder");
  return (
    <fieldset
      role="radiogroup"
      aria-label={t("optimizationMode")}
      className="grid min-w-0 gap-3"
    >
      <legend className="mb-1 text-sm font-semibold text-foreground">
        {t("optimizationMode")}
      </legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {optimizationModeDefinitions.map((mode) => {
          const Icon = mode.icon;
          const label = t(mode.value);
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
                aria-label={label}
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
                <span className="block font-bold text-foreground">{label}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                  {t(`${mode.value}Description`)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {t("preferenceDisclaimer")}
      </p>
    </fieldset>
  );
}
