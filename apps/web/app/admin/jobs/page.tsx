import {
  AdminActionButton,
  JobCreationToggle,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminEmpty,
  AdminPageHeader,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminJobs,
  loadRuntimeSettings,
  requireAdminPageAccess,
} from "@/features/admin/server";

export default async function AdminJobsPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [jobs, settings] = await Promise.all([
    loadAdminJobs(),
    loadRuntimeSettings(),
  ]);
  return (
    <div className="page-stack">
      <AdminPageHeader
        eyebrow="DETERMINISTIC JOB CONTROL"
        title="任务与 AI"
        description="只能重试、取消或回收确认超时的任务；固定快照、目录版本、路线与分数不可修改。"
      />
      <section className="admin-card">
        <h2>控制</h2>
        <div className="admin-actions">
          <StatusPill
            state={
              settings.settings.job_creation_enabled
                ? "任务创建已开启"
                : "任务创建已关闭"
            }
          />
          <JobCreationToggle version={settings} />
          <AdminActionButton action="template_ai_healthcheck">
            Template Provider 自检
          </AdminActionButton>
        </div>
      </section>
      <section className="admin-card">
        <h2>最近任务</h2>
        {jobs.length === 0 ? (
          <AdminEmpty>暂无任务。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID / requester</th>
                  <th>状态</th>
                  <th>固定版本</th>
                  <th>租约</th>
                  <th>结果</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td>
                      {job.job_id}
                      <br />
                      <small>{job.requester_display}</small>
                    </td>
                    <td>
                      <StatusPill state={job.status} />
                      <br />
                      attempt {job.attempt_count}
                    </td>
                    <td>
                      snapshot {job.snapshot_id}
                      <br />
                      catalog {job.catalog_version_id}
                    </td>
                    <td>
                      {job.locked ? "已锁定" : "无锁"}
                      <br />
                      <small>{formatAdminTime(job.heartbeat_at)}</small>
                    </td>
                    <td>
                      routes {job.route_count}
                      <br />
                      {job.ai_provider ?? "—"}
                      {job.degraded ? " · degraded" : ""}
                      <br />
                      {job.error_code ?? ""}
                      <br />
                      {job.execution_plan_id
                        ? `plan ${job.execution_plan_id}`
                        : ""}
                    </td>
                    <td>
                      <div className="admin-actions">
                        {job.status === "failed" && (
                          <AdminActionButton
                            action="retry_breeding_job"
                            payload={{ job_id: job.job_id }}
                          >
                            重试
                          </AdminActionButton>
                        )}
                        {!["completed", "failed", "cancelled"].includes(
                          job.status,
                        ) && (
                          <AdminActionButton
                            action="cancel_breeding_job"
                            payload={{ job_id: job.job_id }}
                            confirmText="取消任务"
                          >
                            取消
                          </AdminActionButton>
                        )}
                        {job.locked && (
                          <AdminActionButton
                            action="reap_stale_job_lock"
                            payload={{
                              job_id: job.job_id,
                              confirmed_stale: true,
                            }}
                            confirmText="确认锁已超时"
                          >
                            回收超时锁
                          </AdminActionButton>
                        )}
                      </div>
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
