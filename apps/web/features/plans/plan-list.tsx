import type { PlanListPage, PlanStatus } from "@palhatch/contracts";
import Link from "next/link";

import type { PlanStatusFilter } from "./server";

const labels: Record<PlanStatus, string> = {
  active: "进行中",
  awaiting_confirmation: "待确认",
  paused: "已暂停",
  completed: "已完成",
  invalidated: "已失效",
  cancelled: "已取消",
};

const filters: readonly [PlanStatusFilter, string][] = [
  ["all", "全部"],
  ["active", "进行中"],
  ["awaiting_confirmation", "待确认"],
  ["completed", "已完成"],
  ["paused", "已暂停"],
  ["invalidated", "已失效"],
];

export function PlanList({
  page,
  status,
}: Readonly<{ page: PlanListPage; status: PlanStatusFilter }>) {
  return (
    <div className="grid min-w-0 gap-5">
      <nav className="flex flex-wrap gap-2" aria-label="计划状态筛选">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={value === "all" ? "/plans" : `/plans?status=${value}`}
            aria-current={status === value ? "page" : undefined}
            className={status === value ? "primary-button" : "secondary-button"}
          >
            {label}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <section className="state-card">
          <h2 className="text-xl font-semibold text-white">暂无执行计划</h2>
          <p className="mt-2 text-sm text-slate-400">
            在配种结果页采用一条确定性路线后，它会出现在这里。
          </p>
          <Link className="primary-button mt-5 inline-flex" href="/breeder">
            打开配种器
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {page.items.map((plan) => (
            <Link
              key={plan.plan_id}
              href={`/plans/${plan.plan_id}`}
              className="content-panel min-w-0 transition hover:border-teal-200/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">{labels[plan.status]}</p>
                  <h2 className="mt-2 truncate text-xl font-semibold text-white">
                    {plan.target_pal_display_name}
                  </h2>
                  <p className="mt-1 break-all text-xs text-slate-500">
                    {plan.target_pal_id}
                  </p>
                </div>
                {plan.pending_candidate_count > 0 ? (
                  <span className="passive-chip">
                    {plan.pending_candidate_count} 个候选
                  </span>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-slate-300">
                期望被动：
                {plan.desired_passive_display_names.join("、") || "无指定被动"}
              </p>
              <dl className="metric-grid mt-5">
                <div>
                  <span>当前步骤</span>
                  <strong>
                    {Math.min(
                      plan.current_step_index + 1,
                      plan.total_step_count,
                    )}{" "}
                    / {plan.total_step_count}
                  </strong>
                </div>
                <div>
                  <span>固定快照</span>
                  <strong className="truncate text-xs">
                    {plan.version_pin.inventory_snapshot_id.slice(0, 8)}
                  </strong>
                </div>
                <div>
                  <span>目录版本</span>
                  <strong className="truncate text-xs">
                    {plan.version_pin.game_data_version_id.slice(0, 8)}
                  </strong>
                </div>
              </dl>
              <p className="mt-4 text-xs text-slate-500">
                更新于 {new Date(plan.updated_at).toLocaleString("zh-CN")}
              </p>
            </Link>
          ))}
        </div>
      )}
      {page.next_cursor === null ? null : (
        <Link
          className="secondary-button justify-self-center"
          href={`/plans?status=${status}&cursor=${encodeURIComponent(page.next_cursor)}&boundary=${encodeURIComponent(page.query_boundary)}`}
        >
          下一页
        </Link>
      )}
    </div>
  );
}
