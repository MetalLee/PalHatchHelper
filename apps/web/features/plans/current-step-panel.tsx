"use client";

import type {
  OffspringCandidate,
  PlanStatus,
  PlanStep,
} from "@palhatch/contracts";
import {
  Baby,
  Boxes,
  Dna,
  Fingerprint,
  MapPin,
  MoreHorizontal,
  Play,
  RefreshCcw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { StatusChip } from "@/components/status/status-chip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { CandidateDialog } from "./candidate-dialog";
import type { RunPlanAction } from "./plan-action-types";
import {
  palGenderLabel,
  planStepStatusLabels,
  safeInstanceSummary,
} from "./presentation";

export function CurrentStepPanel({
  step,
  planStatus,
  planConcurrencyVersion,
  candidates,
  palNames,
  passiveNames,
  busy,
  act,
}: Readonly<{
  step: PlanStep;
  planStatus: PlanStatus;
  planConcurrencyVersion: number;
  candidates: readonly OffspringCandidate[];
  palNames: ReadonlyMap<string, string>;
  passiveNames: ReadonlyMap<string, string>;
  busy: boolean;
  act: RunPlanAction;
}>) {
  const [existingUid, setExistingUid] = useState("");
  const [allowMismatch, setAllowMismatch] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const expectedChildName =
    palNames.get(step.expected_child_pal_id) ?? step.expected_child_pal_id;
  const canMutate =
    planStatus === "active" || planStatus === "awaiting_confirmation";
  const candidateOwners = uniqueFacts(
    candidates.map((candidate) => candidate.owner_display_name),
  );
  const candidateLocations = uniqueFacts(
    candidates.map(
      (candidate) => candidate.location_name ?? candidate.location_type,
    ),
  );

  return (
    <Card
      className="min-w-0 overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50/96 via-white to-emerald-50/76 py-0 shadow-soft"
      aria-label="当前步骤操作"
    >
      <CardContent className="grid min-w-0 gap-5 p-5 sm:p-6">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">
              Current step · {step.step_index + 1}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">
              当前步骤
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              当前计划的人工推进焦点。所有动作继续使用服务端状态机与乐观并发版本。
            </p>
          </div>
          <StatusChip tone={stepStatusTone(step.status)}>
            {planStepStatusLabels[step.status]}
          </StatusChip>
        </div>

        <div className="grid min-w-0 gap-3 lg:grid-cols-3">
          <ParentFact
            label="父本 / 亲本 A"
            sourceKind={step.parent_a_source_kind}
            instanceUid={step.parent_a_instance_uid}
            parentStepIndex={step.parent_a_step_index}
          />
          <ParentFact
            label="母本 / 亲本 B"
            sourceKind={step.parent_b_source_kind}
            instanceUid={step.parent_b_instance_uid}
            parentStepIndex={step.parent_b_step_index}
          />
          <div className="min-w-0 rounded-3xl border border-emerald-200 bg-white/84 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <PalPortrait
                palId={step.expected_child_pal_id}
                name={expectedChildName}
                size={52}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted-foreground">
                  预期子代
                </p>
                <h3 className="mt-1 break-words font-bold text-foreground">
                  {expectedChildName}
                </h3>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {step.expected_child_pal_id}
                </p>
              </div>
            </div>
          </div>
        </div>

        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StepFact icon={ShieldCheck} label="必需性别">
            {palGenderLabel(step.preferred_gender)}
          </StepFact>
          <StepFact icon={Baby} label="候选数量">
            {candidates.length} 个
          </StepFact>
          <StepFact icon={Users} label="相关所有者">
            {candidateOwners || "候选出现后显示"}
          </StepFact>
          <StepFact icon={MapPin} label="相关位置">
            {candidateLocations || "候选出现后显示"}
          </StepFact>
          <StepFact icon={Fingerprint} label="并发版本">
            计划 v{planConcurrencyVersion} · 步骤 v{step.concurrency_version}
          </StepFact>
          <StepFact icon={RefreshCcw} label="当前尝试">
            第 {step.attempt_number} 次
          </StepFact>
        </dl>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Dna aria-hidden="true" className="size-3.5" />
            必需被动及 Rank
          </p>
          {step.required_passive_ids.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">无指定被动</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {step.required_passive_ids.map((passiveId) => (
                <PassiveBadge
                  key={passiveId}
                  name={passiveNames.get(passiveId) ?? passiveId}
                  rank={null}
                  showRank
                  className="max-w-full"
                />
              ))}
            </div>
          )}
        </div>

        <p
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950"
          role="note"
        >
          系统只检测候选，必须由玩家确认；不会自动修改游戏或存档。当前计划投影没有提供初始亲本的
          Pal 种类、性别、所有者和位置，因此界面只展示真实实例摘要，不做推断。
        </p>

        <div className="flex flex-wrap gap-2">
          {step.status === "not_started" && canMutate ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void act({ action: "start", step_id: step.step_id })
              }
            >
              <Play aria-hidden="true" className="size-4" />
              标记为配种中
            </Button>
          ) : null}
          {["breeding", "candidate_detected", "retrying"].includes(
            step.status,
          ) && canMutate ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void act({ action: "continue", step_id: step.step_id })
              }
            >
              <RefreshCcw aria-hidden="true" className="size-4" />
              继续尝试
            </Button>
          ) : null}
          {candidates.length > 0 ? (
            <CandidateDialog
              candidates={candidates}
              passiveNames={passiveNames}
              busy={busy || !canMutate}
              act={act}
            />
          ) : null}
          {canMutate ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button type="button" variant="outline">
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                  更多步骤操作
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[min(92vw,30rem)] overflow-y-auto border-glass-border bg-background sm:max-w-md">
                <SheetHeader className="border-b border-border p-5 pr-14">
                  <SheetTitle>更多步骤操作</SheetTitle>
                  <SheetDescription>
                    选择已有 Pal 或跳过步骤都会改变执行历史，请核对后确认。
                  </SheetDescription>
                </SheetHeader>
                <div className="grid min-w-0 gap-7 p-5">
                  <section
                    className="grid gap-4"
                    aria-labelledby="existing-pal"
                  >
                    <div>
                      <h3
                        id="existing-pal"
                        className="font-bold text-foreground"
                      >
                        选择已有 Pal
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        使用最新安全库存中的真实 instance UID。
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="existing-pal-uid">实例 UID</Label>
                      <Input
                        id="existing-pal-uid"
                        value={existingUid}
                        onChange={(event) => setExistingUid(event.target.value)}
                        placeholder="输入实例 UID"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="passive-match-policy">被动匹配策略</Label>
                      <Select
                        value={allowMismatch ? "allow" : "strict"}
                        onValueChange={(value) =>
                          setAllowMismatch(value === "allow")
                        }
                      >
                        <SelectTrigger
                          id="passive-match-policy"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="strict">
                            必须完全满足被动要求
                          </SelectItem>
                          <SelectItem value="allow">
                            明确接受被动不完全匹配
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || existingUid.trim() === ""}
                        >
                          <Boxes aria-hidden="true" className="size-4" />
                          选择已有 Pal
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            使用这个已有 Pal 作为步骤结果？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            服务端会校验种类、可访问性和被动要求；确认后会推进计划并校验后续步骤。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "select_existing",
                                step_id: step.step_id,
                                pal_instance_uid: existingUid.trim(),
                                allow_passive_mismatch: allowMismatch,
                              })
                            }
                          >
                            确认使用此 Pal
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </section>

                  <section
                    className="grid gap-4 border-t border-border pt-6"
                    aria-labelledby="skip-step"
                  >
                    <div>
                      <h3 id="skip-step" className="font-bold text-foreground">
                        跳过步骤
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        原因必填并写入不可变审计历史。
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="skip-reason">跳过原因</Label>
                      <Input
                        id="skip-reason"
                        value={skipReason}
                        onChange={(event) => setSkipReason(event.target.value)}
                        placeholder="说明为什么跳过此步骤"
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={busy || skipReason.trim() === ""}
                        >
                          跳过步骤
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            确认跳过当前步骤？
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            该动作会写入计划历史，且可能使后续步骤需要重新校验。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>返回检查</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-white hover:bg-destructive/90"
                            disabled={busy}
                            onClick={() =>
                              void act({
                                action: "skip",
                                step_id: step.step_id,
                                reason: skipReason.trim(),
                              })
                            }
                          >
                            确认跳过步骤
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </section>
                </div>
              </SheetContent>
            </Sheet>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ParentFact({
  label,
  sourceKind,
  instanceUid,
  parentStepIndex,
}: Readonly<{
  label: string;
  sourceKind: PlanStep["parent_a_source_kind"];
  instanceUid: string | null;
  parentStepIndex: number | null;
}>) {
  const description =
    sourceKind === "prior_step"
      ? `步骤 ${(parentStepIndex ?? 0) + 1} 的真实子代`
      : instanceUid === null
        ? "实例摘要未提供"
        : `实例 ${safeInstanceSummary(instanceUid)}`;
  return (
    <div className="min-w-0 rounded-3xl border border-border bg-white/84 p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 break-all font-semibold text-foreground">
        {description}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">
        {sourceKind === "prior_step"
          ? "来自计划前序步骤"
          : "Pal 种类、性别、所有者与位置未包含在当前计划安全投影"}
      </p>
    </div>
  );
}

function StepFact({
  icon: Icon,
  label,
  children,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}>) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-white/78 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-foreground">
        {children}
      </dd>
    </div>
  );
}

function uniqueFacts(values: readonly string[]): string {
  return [...new Set(values.filter((value) => value.trim() !== ""))].join("、");
}

function stepStatusTone(
  status: PlanStep["status"],
): "good" | "warning" | "danger" | "neutral" {
  if (status === "completed") return "good";
  if (status === "candidate_detected") return "warning";
  if (status === "invalidated") return "danger";
  return "neutral";
}
