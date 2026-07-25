import type { BreederJobStatus } from "@palhatch/contracts";
import { GitBranch, SearchX, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function WaitingForBreedingResult({
  status,
}: Readonly<{ status: BreederJobStatus }>) {
  return (
    <section className="rounded-3xl border border-dashed border-border bg-white/68 p-7 text-center">
      <GitBranch aria-hidden="true" className="mx-auto size-9 text-primary" />
      <h2 className="mt-3 text-xl font-bold text-foreground">
        {status === "failed" || status === "cancelled"
          ? "任务没有生成路线"
          : "正在准备方案比较"}
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        页面会继续轮询真实任务阶段，不显示虚假百分比。刷新页面后仍会从同一任务恢复。
      </p>
    </section>
  );
}

export function NoBreedingRouteState({
  hardSearchLimit,
  heuristicSearchPruned,
  explanationCodes,
}: Readonly<{
  hardSearchLimit: boolean;
  heuristicSearchPruned: boolean;
  explanationCodes: readonly string[];
}>) {
  const title = hardSearchLimit
    ? "搜索达到安全上限"
    : heuristicSearchPruned
      ? "启发式搜索未找到候选"
      : "当前没有合法路线";
  const description = hardSearchLimit
    ? "当前结果不能证明不存在合法路线。可降低最大代数、减少期望被动，或缩小可借用库存范围后创建新任务。"
    : heuristicSearchPruned
      ? "本轮搜索经过状态剪枝，不能据此断言没有合法路线。固定输入可供后续算法版本重新计算。"
      : "可减少期望被动、提高最大代数，或在确认共享权限后允许使用公会库存，再创建新任务。";

  return (
    <section
      className="rounded-3xl border border-dashed border-border bg-white/72 p-7 text-center"
      role="status"
    >
      <SearchX
        aria-hidden="true"
        className="mx-auto size-9 text-muted-foreground"
      />
      <h2 className="mt-3 text-xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <ExplanationCodes codes={explanationCodes} />
    </section>
  );
}

export function BreedingSearchDiagnostics({
  hardSearchLimit,
  explanationCodes,
}: Readonly<{
  hardSearchLimit: boolean;
  explanationCodes: readonly string[];
}>) {
  if (!hardSearchLimit) return null;
  return (
    <Alert
      role="status"
      className="rounded-3xl border-amber-200 bg-amber-50/94 text-amber-950"
    >
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>已返回预算内的最优候选</AlertTitle>
      <AlertDescription className="text-amber-900">
        搜索受到节点或时间安全预算限制，未穷举全部路线。
        <ExplanationCodes codes={explanationCodes} />
      </AlertDescription>
    </Alert>
  );
}

function ExplanationCodes({ codes }: Readonly<{ codes: readonly string[] }>) {
  if (codes.length === 0) return null;
  return (
    <span className="mt-3 flex flex-wrap justify-center gap-2">
      {codes.map((code) => (
        <span
          key={code}
          className="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 font-mono text-[0.68rem]"
        >
          {code}
        </span>
      ))}
    </span>
  );
}
