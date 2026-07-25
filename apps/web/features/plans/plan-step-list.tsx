"use client";

import type { PlanStep } from "@palhatch/contracts";
import { Dna, Fingerprint } from "lucide-react";
import type { ReactNode } from "react";

import { GenderDisplay } from "@/components/pals/gender-display";
import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { BreedingTreePassiveFact } from "@/features/breeder/lib/build-breeding-tree";

import {
  palGenderLabel,
  planStepStatusLabels,
  safeInstanceSummary,
} from "./presentation";

export function PlanStepList({
  steps,
  currentStepIndex,
  palNames,
  passiveNames,
  passiveFacts,
}: Readonly<{
  steps: readonly PlanStep[];
  currentStepIndex: number;
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact>;
}>) {
  return (
    <Card
      className="min-w-0 border-glass-border bg-card/90 py-0 shadow-soft"
      aria-label="执行步骤"
    >
      <CardContent className="min-w-0 p-5 sm:p-6">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
            Step history
          </p>
          <h2 className="mt-2 text-xl font-bold text-foreground">
            全部执行步骤
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前步骤默认展开；已完成和待开始步骤可按需查看，历史事实不会在浏览器重新计算。
          </p>
        </div>
        <Accordion
          type="single"
          collapsible
          defaultValue={`step-${currentStepIndex}`}
          className="mt-4"
        >
          {steps.map((step) => {
            const current = step.step_index === currentStepIndex;
            const expectedName =
              palNames.get(step.expected_child_pal_id) ??
              step.expected_child_pal_id;
            return (
              <AccordionItem
                key={step.step_id}
                value={`step-${step.step_index}`}
                className={cn(
                  "rounded-2xl border px-4 last:border-b",
                  step.status === "completed" &&
                    "border-emerald-200 bg-emerald-50/70",
                  step.status === "candidate_detected" &&
                    "border-violet-200 bg-violet-50/70",
                  step.status === "invalidated" &&
                    "border-orange-300 bg-orange-50/80",
                  current &&
                    step.status !== "candidate_detected" &&
                    step.status !== "invalidated" &&
                    "border-sky-300 bg-sky-50/72",
                  !current &&
                    step.status === "not_started" &&
                    "border-slate-200 bg-slate-50/70",
                  "mb-3",
                )}
              >
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <PalPortrait
                      palId={step.expected_child_pal_id}
                      name={expectedName}
                      size={44}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="break-words text-foreground">
                          步骤 {step.step_index + 1} · {expectedName}
                        </strong>
                        <StatusChip tone={stepTone(step.status)}>
                          {current ? "当前 · " : ""}
                          {planStepStatusLabels[step.status]}
                        </StatusChip>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        尝试 {step.attempt_number} 次 ·{" "}
                        <GenderDisplay
                          gender={step.preferred_gender}
                          label={palGenderLabel(step.preferred_gender)}
                        />
                      </span>
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid min-w-0 gap-4 border-t border-border/70 pt-4">
                    <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <StepDatum label="亲本 A">
                        {parentText(
                          step.parent_a_source_kind,
                          step.parent_a_instance_uid,
                          step.parent_a_step_index,
                        )}
                      </StepDatum>
                      <StepDatum label="亲本 B">
                        {parentText(
                          step.parent_b_source_kind,
                          step.parent_b_instance_uid,
                          step.parent_b_step_index,
                        )}
                      </StepDatum>
                      <StepDatum label="并发版本">
                        <span className="inline-flex items-center gap-1.5">
                          <Fingerprint
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          v{step.concurrency_version}
                        </span>
                      </StepDatum>
                      <StepDatum label="当前结果">
                        {step.selected_child_instance_uid === null
                          ? "尚未选择真实子代"
                          : `实例 ${safeInstanceSummary(
                              step.selected_child_instance_uid,
                            )}`}
                      </StepDatum>
                    </dl>
                    <div>
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <Dna aria-hidden="true" className="size-3.5" />
                        必需被动
                      </p>
                      {step.required_passive_ids.length === 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          无指定被动
                        </p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {step.required_passive_ids.map((passiveId) => (
                            <PassiveBadge
                              key={passiveId}
                              name={passiveNames.get(passiveId) ?? passiveId}
                              rank={passiveFacts.get(passiveId)?.rank ?? null}
                              isNegative={
                                passiveFacts.get(passiveId)?.isNegative ?? null
                              }
                              className="max-w-full"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {step.skip_reason ? (
                      <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-950">
                        跳过原因：{step.skip_reason}
                      </p>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function StepDatum({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/70 p-3">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-semibold text-foreground">
        {children}
      </dd>
    </div>
  );
}

function parentText(
  sourceKind: PlanStep["parent_a_source_kind"],
  instanceUid: string | null,
  parentStepIndex: number | null,
): string {
  if (sourceKind === "prior_step") {
    return `步骤 ${(parentStepIndex ?? 0) + 1} 的真实子代`;
  }
  return instanceUid === null
    ? "实例摘要未提供"
    : `库存实例 ${safeInstanceSummary(instanceUid)}`;
}

function stepTone(
  status: PlanStep["status"],
): "good" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "good";
  if (status === "candidate_detected") return "warning";
  if (status === "invalidated") return "danger";
  return "neutral";
}
