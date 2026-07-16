import {
  AdminEmpty,
  AdminPageHeader,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminAuditEvents,
  loadAdminOverview,
  requireAdminPageAccess,
} from "@/features/admin/server";

export default async function AdminOverviewPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [overview, audit] = await Promise.all([
    loadAdminOverview(),
    loadAdminAuditEvents(),
  ]);
  const workers = [
    ["Agent", overview.agent],
    ["Save Worker", overview.save_worker],
    ["Job Worker", overview.job_worker],
    ["Candidate Detector", overview.candidate_detector],
  ] as const;
  return (
    <div className="page-stack">
      <AdminPageHeader
        eyebrow="OPERATIONS OVERVIEW"
        title="管理员概览"
        description="仅显示脱敏运行摘要；不包含密钥、Token、公网 IP、路径、原始存档名、堆栈或 SQL。"
      />
      {overview.stale && (
        <section className="admin-card border-amber-300/20" role="status">
          <p className="eyebrow text-amber-200">STALE</p>
          <p>最近心跳已过期，当前状态可能不是实时值。</p>
        </section>
      )}
      <section className="admin-grid" aria-label="Worker 状态">
        {workers.map(([name, worker]) => (
          <article className="admin-card" key={name}>
            <h2>{name}</h2>
            <dl className="admin-kv">
              <dt>状态</dt>
              <dd>
                <StatusPill state={worker.state} />
              </dd>
              <dt>最近心跳</dt>
              <dd>{formatAdminTime(worker.last_heartbeat_at)}</dd>
              <dt>数据过期</dt>
              <dd>{worker.stale ? "是" : "否"}</dd>
            </dl>
          </article>
        ))}
      </section>
      <section className="admin-grid">
        <article className="admin-card">
          <h2>库存与 Parser</h2>
          {overview.latest_successful_snapshot ? (
            <dl className="admin-kv">
              <dt>最新快照</dt>
              <dd>{overview.latest_successful_snapshot.snapshot_id}</dd>
              <dt>同步时间</dt>
              <dd>
                {formatAdminTime(
                  overview.latest_successful_snapshot.captured_at,
                )}
              </dd>
              <dt>帕鲁数量</dt>
              <dd>{overview.latest_successful_snapshot.pal_count}</dd>
              <dt>Parser</dt>
              <dd>
                {overview.parser.name ?? "未上报"} ·{" "}
                {overview.parser.version ?? "—"}
              </dd>
            </dl>
          ) : (
            <AdminEmpty>暂无成功快照。</AdminEmpty>
          )}
        </article>
        <article className="admin-card">
          <h2>游戏目录</h2>
          <dl className="admin-kv">
            <dt>版本 ID</dt>
            <dd>{overview.catalog.version_id ?? "未发布"}</dd>
            <dt>Build</dt>
            <dd>{overview.catalog.build ?? "—"}</dd>
            <dt>游戏版本</dt>
            <dd>{overview.catalog.game_version ?? "—"}</dd>
            <dt>Content hash</dt>
            <dd>{overview.catalog.content_hash ?? "—"}</dd>
          </dl>
        </article>
        <article className="admin-card">
          <h2>任务队列</h2>
          <dl className="admin-kv">
            <dt>pending</dt>
            <dd>{overview.job_counts.pending}</dd>
            <dt>processing</dt>
            <dd>{overview.job_counts.processing}</dd>
            <dt>retry</dt>
            <dd>{overview.job_counts.retry}</dd>
            <dt>failed</dt>
            <dd>{overview.job_counts.failed}</dd>
          </dl>
        </article>
        <article className="admin-card">
          <h2>AI 与部署</h2>
          <dl className="admin-kv">
            <dt>Provider</dt>
            <dd>{overview.ai_provider.provider}</dd>
            <dt>状态</dt>
            <dd>
              <StatusPill state={overview.ai_provider.state} />
            </dd>
            <dt>已降级</dt>
            <dd>{overview.ai_provider.degraded ? "是" : "否"}</dd>
            <dt>磁盘</dt>
            <dd>
              <StatusPill state={overview.disk.level} />
            </dd>
            <dt>可用空间</dt>
            <dd>
              {overview.disk.available_bytes === null
                ? "未上报"
                : `${Math.floor(overview.disk.available_bytes / 1_048_576)} MiB`}
            </dd>
            <dt>部署版本</dt>
            <dd>{overview.deployment_version}</dd>
          </dl>
        </article>
      </section>
      {overview.recent_failure && (
        <section className="admin-card border-rose-300/20">
          <h2>最近失败安全摘要</h2>
          <p>
            <StatusPill state={overview.recent_failure.error_code} /> ·{" "}
            {overview.recent_failure.summary}
          </p>
          <small>{formatAdminTime(overview.recent_failure.occurred_at)}</small>
        </section>
      )}
      <section className="admin-card">
        <h2>最近审计</h2>
        {audit.length === 0 ? (
          <AdminEmpty>暂无管理员操作。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>操作者</th>
                  <th>目标</th>
                </tr>
              </thead>
              <tbody>
                {audit.slice(0, 20).map((event) => (
                  <tr key={event.event_id}>
                    <td>{formatAdminTime(event.created_at)}</td>
                    <td>{event.event_type}</td>
                    <td>{event.actor_display}</td>
                    <td>
                      {event.target_type} · {event.target_id ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
import { AdminAccessDenied } from "@/features/admin/access";
