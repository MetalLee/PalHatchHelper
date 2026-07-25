import { PageError } from "@/components/states/page-error";

const messages: Record<string, [string, string]> = {
  PLAN_NOT_FOUND: ["计划不存在", "该计划不存在，或当前账号无权查看。"],
  PLAN_ACCESS_DENIED: ["权限不足", "只能查看和操作自己的执行计划。"],
  PLAN_FIXED_VERSION_UNAVAILABLE: [
    "固定版本不可用",
    "历史计划仍被保留，但当前固定目录版本需要管理员检查。",
  ],
  PLAN_VERSION_CONFLICT: [
    "计划已在别处更新",
    "页面会保留历史，请刷新后基于最新版本重试。",
  ],
  DATA_UNAVAILABLE: ["计划数据暂不可用", "请稍后重试，不会回退到其他版本。"],
};

export function PlanError({ code }: Readonly<{ code: string }>) {
  const [title, description] = messages[code] ?? ["操作未完成", code];
  return <PageError code={code} title={title} description={description} />;
}
