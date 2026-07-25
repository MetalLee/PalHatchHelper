import type {
  BreederDifficulty,
  BreederJobStatus,
  BreederOptimizationMode,
  BreedingRouteViewParent,
  RouteScoreComponent,
} from "@palhatch/contracts";

export const optimizationModeLabels: Record<BreederOptimizationMode, string> = {
  balanced: "综合推荐",
  fastest: "最快路线",
  highest_success: "最高成功率",
  least_borrowing: "最少借用",
};

export const difficultyLabels: Record<BreederDifficulty, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const scoreComponentLabels: Record<
  RouteScoreComponent["component"],
  string
> = {
  route_length: "路线长度",
  inventory_coverage: "库存覆盖",
  passive_concentration: "被动集中度",
  borrowing: "公会借用成本",
  intermediate_cost: "中间 Pal 成本",
  attempt_cost: "预计尝试成本",
  stability: "路线稳定性",
  acquisition_cost: "缺失库存成本",
};

export const jobStagePresentation: Record<
  BreederJobStatus,
  { label: string; description: string }
> = {
  pending: {
    label: "等待 Worker 领取",
    description: "任务已固定输入与版本，正在等待私有 Worker 安全领取。",
  },
  processing: {
    label: "正在搜索合法路线",
    description: "确定性算法正在固定目录和库存快照上计算路线。",
  },
  algorithm_completed: {
    label: "算法计算已完成",
    description: "合法性、评分和路线事实已完成，正在准备辅助说明。",
  },
  ai_enriching: {
    label: "正在生成辅助说明",
    description: "AI 只解释已确定的路线，不会修改配方或基础评分。",
  },
  retry_pending: {
    label: "等待安全重试",
    description: "Worker 会按任务租约恢复处理，固定输入不会改变。",
  },
  completed: {
    label: "任务完成",
    description: "可比较最多三条确定性路线，并选择库存完整的方案。",
  },
  failed: {
    label: "任务失败",
    description: "任务保留稳定错误码；请按错误码检查后重新创建。",
  },
  cancelled: {
    label: "任务已取消",
    description: "任务不会继续处理，已固定的版本信息仍可审计。",
  },
};

export function localizedName(
  names: ReadonlyMap<string, string>,
  id: string,
  entityLabel: string,
): string {
  return names.get(id) ?? `未翻译${entityLabel}（${id}）`;
}

export function localizedNames(
  names: ReadonlyMap<string, string>,
  ids: readonly string[],
  entityLabel: string,
): string[] {
  return ids.map((id) => localizedName(names, id, entityLabel));
}

export function genderLabel(gender: BreedingRouteViewParent["gender"]): string {
  if (gender === "male") return "雄性";
  if (gender === "female") return "雌性";
  if (gender === "genderless") return "无性别";
  return "性别待定";
}

export function compactIdentifier(value: string, limit = 24): string {
  if (value.length <= limit) return value;
  const edge = Math.max(4, Math.floor((limit - 1) / 2));
  return `${value.slice(0, edge)}…${value.slice(-edge)}`;
}
