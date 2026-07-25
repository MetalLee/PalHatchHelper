"use client";

import type { OffspringCandidate } from "@palhatch/contracts";
import {
  CheckCircle2,
  Clock3,
  MapPin,
  ScanSearch,
  ShieldCheck,
  UserRound,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { PalPortrait } from "@/components/pals/pal-portrait";
import { PassiveBadge } from "@/components/pals/passive-badge";
import { palLocationText } from "@/components/pals/pal-location";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { RunPlanAction } from "./plan-action-types";
import type { BreedingTreePassiveFact } from "@/features/breeder/lib/build-breeding-tree";
import {
  formatPlanDateTime,
  palGenderLabel,
  safeInstanceSummary,
} from "./presentation";

const breakdownLabels: Record<
  keyof OffspringCandidate["match_breakdown"],
  string
> = {
  species: "种类",
  passive_overlap: "被动匹配",
  gender: "性别",
  accessibility: "可访问性",
  first_appearance: "首次出现",
};

export function CandidateDialog({
  candidates,
  passiveNames,
  passiveFacts,
  busy,
  act,
}: Readonly<{
  candidates: readonly OffspringCandidate[];
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact>;
  busy: boolean;
  act: RunPlanAction;
}>) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <ScanSearch aria-hidden="true" className="size-4" />
          查看候选子代
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(88dvh,54rem)] overflow-y-auto border-glass-border bg-background/98 p-5 sm:max-w-3xl sm:p-6">
        <DialogHeader className="pr-10">
          <DialogTitle>候选子代</DialogTitle>
          <DialogDescription>
            这些候选来自新库存快照。系统不会自动完成步骤，必须由你确认真实实例。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-4">
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.candidate_key}
              candidate={candidate}
              passiveNames={passiveNames}
              passiveFacts={passiveFacts}
              busy={busy}
              act={act}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateCard({
  candidate,
  passiveNames,
  passiveFacts,
  busy,
  act,
}: Readonly<{
  candidate: OffspringCandidate;
  passiveNames: ReadonlyMap<string, string>;
  passiveFacts: ReadonlyMap<string, BreedingTreePassiveFact>;
  busy: boolean;
  act: RunPlanAction;
}>) {
  const unavailable = candidate.confirmed || candidate.rejected_at !== null;
  const candidateState = candidate.confirmed
    ? "已确认"
    : candidate.rejected_at !== null
      ? "已拒绝"
      : candidate.accessible
        ? "可确认"
        : "当前不可访问";

  return (
    <article
      className="min-w-0 rounded-3xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-4 shadow-sm sm:p-5"
      data-testid="offspring-candidate"
    >
      <div className="flex min-w-0 items-start gap-3">
        <PalPortrait
          palId={candidate.pal_id}
          name={candidate.pal_display_name}
          size={56}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              tone={
                candidate.confirmed
                  ? "good"
                  : candidate.rejected_at !== null || !candidate.accessible
                    ? "danger"
                    : "neutral"
              }
            >
              {candidateState}
            </StatusChip>
            <span className="rounded-full border border-violet-200 bg-violet-100 px-2.5 py-1 text-xs font-bold tabular-nums text-violet-900">
              系统匹配评分 {candidate.match_score.toFixed(2)}
            </span>
          </div>
          <h3 className="mt-2 break-words text-lg font-bold text-foreground">
            {candidate.pal_display_name}
          </h3>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            实例 {safeInstanceSummary(candidate.pal_instance_uid)}
          </p>
        </div>
      </div>

      <p className="mt-4 rounded-2xl bg-violet-100/70 px-3 py-2 text-xs leading-5 text-violet-950">
        match score 仅是系统候选匹配评分，不是遗传概率。
      </p>

      <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
        <Fact icon={ShieldCheck} label="性别">
          {palGenderLabel(candidate.gender)}
        </Fact>
        <Fact icon={UserRound} label="所有者">
          {candidate.owner_display_name}
        </Fact>
        <Fact icon={MapPin} label="位置">
          {palLocationText(candidate)}
        </Fact>
        <Fact icon={Clock3} label="首次发现">
          {formatPlanDateTime(candidate.first_detected_at)}
        </Fact>
      </dl>

      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground">
          候选被动及 Rank（当前安全投影仅含匹配项）
        </p>
        {candidate.matched_passive_ids.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">无匹配被动</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {candidate.matched_passive_ids.map((passiveId) => (
              <PassiveBadge
                key={passiveId}
                name={passiveNames.get(passiveId) ?? passiveId}
                rank={passiveFacts.get(passiveId)?.rank ?? null}
                isNegative={passiveFacts.get(passiveId)?.isNegative ?? null}
                showRank
                className="max-w-full"
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl bg-white/72 p-3 text-xs sm:grid-cols-3">
        {Object.entries(candidate.match_breakdown).map(([key, value]) => (
          <span key={key} className="text-muted-foreground">
            {breakdownLabels[
              key as keyof OffspringCandidate["match_breakdown"]
            ] ?? key}
            ：
            <strong className="tabular-nums text-foreground">
              {Number(value).toFixed(2)}
            </strong>
          </span>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" disabled={busy || unavailable}>
              <CheckCircle2 aria-hidden="true" className="size-4" />
              {candidate.confirmed ? "已确认" : "确认真实子代"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认并推进这个计划？</AlertDialogTitle>
              <AlertDialogDescription>
                将把实例 {safeInstanceSummary(candidate.pal_instance_uid)}{" "}
                保存为本步骤真实子代，完成当前步骤，并让服务端校验后续步骤。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "confirm",
                    step_id: candidate.step_id,
                    candidate_key: candidate.candidate_key,
                  })
                }
              >
                确认并推进计划
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={busy || unavailable}
            >
              <XCircle aria-hidden="true" className="size-4" />
              {candidate.rejected_at ? "已拒绝" : "拒绝候选"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>拒绝这个候选？</AlertDialogTitle>
              <AlertDialogDescription>
                拒绝会写入计划审计记录；该候选之后不能再被本步骤确认。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>返回检查</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={busy}
                onClick={() =>
                  void act({
                    action: "reject",
                    candidate_key: candidate.candidate_key,
                    reason: "玩家确认不是本次配种结果",
                  })
                }
              >
                确认拒绝
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}>) {
  return (
    <div className="min-w-0 rounded-2xl bg-white/72 p-3">
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Icon aria-hidden="true" className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-1 min-w-0 break-words font-semibold text-foreground">
        {children}
      </dd>
    </div>
  );
}
