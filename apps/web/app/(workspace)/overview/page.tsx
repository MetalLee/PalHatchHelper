import Link from "next/link";

import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";
import { dataStatusPresentation } from "@/features/data-status/presentation";
import { getOverviewSummary, Phase5DataError } from "@/features/pals/server";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const context = await requireUserContext();
  if (context.binding === null)
    return <ErrorState code="PLAYER_BINDING_REQUIRED" />;

  let summary;
  try {
    summary = await getOverviewSummary();
  } catch (error) {
    return (
      <ErrorState
        code={
          error instanceof Phase5DataError ? error.code : "DATA_UNAVAILABLE"
        }
      />
    );
  }
  const status = dataStatusPresentation(summary.data_status.state);
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">OVERVIEW</p>
          <h1>晚上好，{context.binding.player_nickname}</h1>
          <p>
            {context.binding.world_name} ·{" "}
            {context.binding.guild_name ?? "未加入公会"}
          </p>
        </div>
        <Link className="primary-button" href="/pals">
          查看帕鲁库存
        </Link>
      </header>

      <section className="stats-grid" aria-label="库存概览">
        <article className="stat-card stat-card-accent">
          <p>可用候选池</p>
          <strong>{summary.all_count}</strong>
          <span>自己 + 公会已共享</span>
        </article>
        <article className="stat-card">
          <p>我的帕鲁</p>
          <strong>{summary.owned_count}</strong>
          <span>完整库存仅你可见</span>
        </article>
        <article className="stat-card">
          <p>公会共享</p>
          <strong>{summary.shared_count}</strong>
          <span>只含最小必要字段</span>
        </article>
      </section>

      <section className="content-panel grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="eyebrow">WORKSPACE STATUS</p>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            库存协作基础已就绪
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            当前阶段提供安全登录、库存筛选和共享控制。配种任务、路线比较和执行计划属于后续阶段，本页不会提前创建或计算它们。
          </p>
        </div>
        <Link className="status-callout" href="/data-status">
          <span
            className={`status-dot status-${status.tone}`}
            aria-hidden="true"
          />
          <span>
            <strong>{status.title}</strong>
            <small>{status.description}</small>
          </span>
        </Link>
      </section>
    </div>
  );
}
