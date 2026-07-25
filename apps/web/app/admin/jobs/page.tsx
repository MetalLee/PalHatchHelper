import {
  AdminActionButton,
  JobCreationToggle,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
            <Table className="min-w-[68rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID / requester</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>固定版本</TableHead>
                  <TableHead>租约</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>动作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.job_id}>
                    <TableCell>
                      <AdminCode>{job.job_id}</AdminCode>
                      <br />
                      <small>{job.requester_display}</small>
                    </TableCell>
                    <TableCell>
                      <StatusPill state={job.status} />
                      <br />
                      attempt {job.attempt_count}
                    </TableCell>
                    <TableCell>
                      <small>snapshot</small>
                      <AdminCode>{job.snapshot_id}</AdminCode>
                      <small>catalog</small>
                      <AdminCode>{job.catalog_version_id}</AdminCode>
                    </TableCell>
                    <TableCell>
                      {job.locked ? "已锁定" : "无锁"}
                      <br />
                      <small>{formatAdminTime(job.heartbeat_at)}</small>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
