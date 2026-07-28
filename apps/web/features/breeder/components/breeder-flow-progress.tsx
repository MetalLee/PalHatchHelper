"use client";

import { Check } from "lucide-react";

import { useCopy } from "@/i18n/client";

export function BreederFlowProgress({
  activeStep = 1,
}: Readonly<{ activeStep?: 1 | 2 | 3 }>) {
  const t = useCopy("Breeder");
  const steps = [t("flowTarget"), t("flowRecommendations"), t("flowPath")];
  return (
    <nav
      className="rounded-3xl border border-glass-border bg-glass p-3 shadow-soft backdrop-blur-md sm:p-4"
      aria-label={t("flowLabel")}
    >
      <ol className="grid min-w-0 grid-cols-3">
        {steps.map((step, index) => {
          const stepNumber = (index + 1) as 1 | 2 | 3;
          const current = stepNumber === activeStep;
          const completed = stepNumber < activeStep;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center gap-2 text-center"
            >
              {index > 0 ? (
                <span
                  aria-hidden="true"
                  className="absolute right-1/2 top-[1.35rem] h-px w-full bg-border"
                />
              ) : null}
              <span
                className={
                  current
                    ? "relative z-10 grid size-11 place-items-center rounded-full bg-primary font-bold text-primary-foreground shadow-sm"
                    : completed
                      ? "relative z-10 grid size-11 place-items-center rounded-full border border-primary/25 bg-emerald-50 font-bold text-primary"
                      : "relative z-10 grid size-11 place-items-center rounded-full border border-border bg-white font-bold text-muted-foreground"
                }
              >
                {completed ? (
                  <>
                    <Check aria-hidden="true" className="size-4" />
                    <span className="sr-only">
                      {t("completedStep", { step: stepNumber })}
                    </span>
                  </>
                ) : (
                  <>
                    {stepNumber}
                    {current ? (
                      <span className="sr-only">{t("currentStep")}</span>
                    ) : null}
                  </>
                )}
              </span>
              <span
                className={
                  current
                    ? "truncate text-xs font-bold text-primary sm:text-sm"
                    : "truncate text-xs font-semibold text-muted-foreground sm:text-sm"
                }
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
