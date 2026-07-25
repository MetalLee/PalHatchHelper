import type {
  InvalidationReasonCode,
  PlanDetail,
  PlanStatus,
  PlanStepStatus,
} from "@palhatch/contracts";

import type { StatusTone } from "@/components/status/status-chip";
import type { BreedingTreeNodeOverlay } from "@/features/breeder/components/breeding-tree-node";

export const planStatusLabels: Record<PlanStatus, string> = {
  active: "进行中",
  awaiting_confirmation: "待确认",
  paused: "已暂停",
  completed: "已完成",
  invalidated: "已失效",
  cancelled: "已取消",
};

export const planStepStatusLabels: Record<PlanStepStatus, string> = {
  not_started: "待开始",
  breeding: "配种中",
  candidate_detected: "候选已检测",
  completed: "已完成",
  retrying: "继续尝试中",
  skipped: "已跳过",
  invalidated: "已失效",
};

export const invalidationReasonDescriptions: Record<
  InvalidationReasonCode,
  string
> = {
  DEPENDENCY_DISAPPEARED: "依赖的 Pal 已从最新库存消失。",
  OWNER_CHANGED: "依赖 Pal 的所有者已发生变化。",
  SHARING_DISABLED: "依赖 Pal 已关闭公会共享。",
  GUILD_ACCESS_LOST: "当前角色已失去所需的公会访问范围。",
  GENDER_INCOMPATIBLE: "当前真实实例的性别不再满足后续步骤。",
  CONFIRMED_RESULT_DIVERGED: "已确认的真实子代与原路线要求不一致。",
  FIXED_CATALOG_UNAVAILABLE: "计划固定的游戏目录版本当前不可用。",
  FIXED_CONTENT_HASH_MISMATCH: "固定目录版本的内容哈希校验不一致。",
};

export function planStatusTone(status: PlanStatus): StatusTone {
  if (status === "completed") return "good";
  if (status === "awaiting_confirmation" || status === "paused")
    return "warning";
  if (status === "invalidated" || status === "cancelled") return "danger";
  return "neutral";
}

export function nextPlanActionLabel(status: PlanStatus): string {
  if (status === "awaiting_confirmation") return "查看并确认候选子代";
  if (status === "paused") return "恢复计划";
  if (status === "invalidated") return "处理失效并重新计算";
  if (status === "completed" || status === "cancelled") return "查看历史计划";
  return "继续当前步骤";
}

export function formatPlanDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function palGenderLabel(
  gender:
    | PlanDetail["candidates"][number]["gender"]
    | PlanDetail["steps"][number]["preferred_gender"],
): string {
  if (gender === "male") return "雄性";
  if (gender === "female") return "雌性";
  if (gender === "genderless") return "无性别";
  return gender === "unknown" ? "性别未解析" : "不限";
}

export function safeInstanceSummary(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function buildPlanStepOverlays(
  detail: PlanDetail,
): ReadonlyMap<number, BreedingTreeNodeOverlay> {
  return new Map(
    detail.steps.map((step) => {
      const current =
        step.step_index === detail.summary.current_step_index &&
        detail.summary.status !== "completed";
      const tone: BreedingTreeNodeOverlay["tone"] =
        step.status === "invalidated"
          ? "invalidated"
          : step.status === "candidate_detected"
            ? "candidate"
            : step.status === "completed"
              ? "completed"
              : current
                ? "current"
                : "pending";
      return [
        step.step_index,
        {
          tone,
          label: current
            ? `当前步骤 · ${planStepStatusLabels[step.status]}`
            : planStepStatusLabels[step.status],
          current,
        },
      ];
    }),
  );
}
