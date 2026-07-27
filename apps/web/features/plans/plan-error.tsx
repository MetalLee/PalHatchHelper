import { PageError } from "@/components/states/page-error";

const messages: Record<string, [string, string]> = {
  PLAN_NOT_FOUND: ["计划不存在", "该计划不存在，或当前账号无权查看。"],
  PLAN_ACCESS_DENIED: ["权限不足", "只能查看和操作自己的收藏计划。"],
  DATA_UNAVAILABLE: [
    "计划数据暂不可用",
    "请稍后重试；已有结果会保留，不会改用其他数据代替。",
  ],
};

export function PlanError({ code }: Readonly<{ code: string }>) {
  const [title, description] = messages[code] ?? ["操作未完成", code];
  return (
    <PageError
      code={code}
      title={title}
      description={description}
      headingLevel="h1"
    />
  );
}
