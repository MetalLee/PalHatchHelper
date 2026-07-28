import { getTranslations } from "next-intl/server";

import {
  AdminActionButton,
  JobCreationToggle,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminEmpty,
  AdminPageHeader,
  adminActionsClasses,
  adminPageClasses,
  adminPanelClasses,
  adminTableFrameClasses,
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
import { requireAppLocale } from "@/i18n/server-locale";

export default async function AdminJobsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [jobs, settings] = await Promise.all([
    loadAdminJobs(),
    loadRuntimeSettings(),
  ]);
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("jobsEyebrow")}
        title={t("jobsTitle")}
        description={t("jobsDescription")}
      />
      <section className={adminPanelClasses}>
        <h2>{t("controls")}</h2>
        <div className={adminActionsClasses}>
          <StatusPill
            state={
              settings.settings.job_creation_enabled
                ? t("jobCreationOpen")
                : t("jobCreationClosed")
            }
          />
          <JobCreationToggle version={settings} />
          <AdminActionButton action="template_ai_healthcheck">
            {t("templateHealthcheck")}
          </AdminActionButton>
        </div>
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("recentJobs")}</h2>
        {jobs.length === 0 ? (
          <AdminEmpty>{t("noJobs")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[68rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("jobRequester")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("pinnedVersions")}</TableHead>
                  <TableHead>{t("lease")}</TableHead>
                  <TableHead>{t("result")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
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
                      {t("attempt", { count: job.attempt_count })}
                    </TableCell>
                    <TableCell>
                      <small>snapshot</small>
                      <AdminCode>{job.snapshot_id}</AdminCode>
                      <small>catalog</small>
                      <AdminCode>{job.catalog_version_id}</AdminCode>
                    </TableCell>
                    <TableCell>
                      {job.locked ? t("locked") : t("unlocked")}
                      <br />
                      <small>{formatTime(job.heartbeat_at)}</small>
                    </TableCell>
                    <TableCell>
                      {t("routes", { count: job.route_count })}
                      <br />
                      {job.ai_provider ?? "—"}
                      {job.degraded ? ` · ${t("degraded")}` : ""}
                      <br />
                      {job.error_code ?? ""}
                    </TableCell>
                    <TableCell>
                      <div className={adminActionsClasses}>
                        {job.status === "failed" && (
                          <AdminActionButton
                            action="retry_breeding_job"
                            payload={{ job_id: job.job_id }}
                          >
                            {t("retry")}
                          </AdminActionButton>
                        )}
                        {!["completed", "failed", "cancelled"].includes(
                          job.status,
                        ) && (
                          <AdminActionButton
                            action="cancel_breeding_job"
                            payload={{ job_id: job.job_id }}
                            confirmText={t("cancelJob")}
                          >
                            {t("cancel")}
                          </AdminActionButton>
                        )}
                        {job.locked && (
                          <AdminActionButton
                            action="reap_stale_job_lock"
                            payload={{
                              job_id: job.job_id,
                              confirmed_stale: true,
                            }}
                            confirmText={t("confirmStaleLock")}
                          >
                            {t("reapLock")}
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
