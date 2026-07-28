import { getTranslations } from "next-intl/server";

import { AdminActionButton } from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminPageHeader,
  adminActionsClasses,
  adminDefinitionListClasses,
  adminGridClasses,
  adminPageClasses,
  adminPanelClasses,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminSaveParserStatus,
  requireAdminPageAccess,
} from "@/features/admin/server";
import { requireAppLocale } from "@/i18n/server-locale";

export default async function AdminSaveParserPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const status = await loadAdminSaveParserStatus();
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("saveParserEyebrow")}
        title={t("saveParserTitle")}
        description={t("saveParserDescription")}
      />
      {status.stale && (
        <section
          className={`${adminPanelClasses} border-amber-200 bg-amber-50/80`}
          role="status"
        >
          {t("saveWorkerStale")}
        </section>
      )}
      <section className={adminGridClasses}>
        <article className={adminPanelClasses}>
          <h2>Save Worker</h2>
          <dl className={adminDefinitionListClasses}>
            <dt>{t("status")}</dt>
            <dd>
              <StatusPill state={status.worker.state} />
            </dd>
            <dt>{t("heartbeat")}</dt>
            <dd>{formatTime(status.worker.last_heartbeat_at)}</dd>
            <dt>save root</dt>
            <dd>
              {status.save_root_configured
                ? t("configured")
                : t("notConfigured")}
            </dd>
            <dt>{t("readOnlyMount")}</dt>
            <dd>
              <StatusPill state={status.read_only_mount} />
            </dd>
          </dl>
        </article>
        <article className={adminPanelClasses}>
          <h2>Parser</h2>
          <dl className={adminDefinitionListClasses}>
            <dt>{t("name")}</dt>
            <dd>{status.parser.name ?? "—"}</dd>
            <dt>{t("version")}</dt>
            <dd>{status.parser.version ?? "—"}</dd>
            <dt>{t("duration")}</dt>
            <dd>
              {status.parse_duration_ms === null
                ? "—"
                : `${status.parse_duration_ms} ms`}
            </dd>
            <dt>{t("palQuantity")}</dt>
            <dd>{status.pal_count ?? "—"}</dd>
          </dl>
        </article>
        <article className={adminPanelClasses}>
          <h2>{t("safetyGuards")}</h2>
          <dl className={adminDefinitionListClasses}>
            <dt>{t("inventoryDrop")}</dt>
            <dd>
              <StatusPill state={status.inventory_drop_state} />
            </dd>
            <dt>{t("disk")}</dt>
            <dd>
              <StatusPill state={status.disk.level} />
            </dd>
            <dt>{t("retentionCount")}</dt>
            <dd>{status.snapshot_retention_count}</dd>
            <dt>{t("latestSnapshot")}</dt>
            <dd>
              <AdminCode>
                {status.latest_snapshot?.snapshot_id ?? "—"}
              </AdminCode>
            </dd>
          </dl>
        </article>
        <article className={adminPanelClasses}>
          <h2>{t("recentFailure")}</h2>
          {status.recent_failure ? (
            <div className="grid gap-2">
              <AdminCode>{status.recent_failure.error_code}</AdminCode>
              <p>{status.recent_failure.summary}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">{t("noFailureSummary")}</p>
          )}
        </article>
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("controlledActions")}</h2>
        <div className={adminActionsClasses}>
          <AdminActionButton action="sync_save_once">
            {t("requestSync")}
          </AdminActionButton>
          {status.latest_snapshot && (
            <AdminActionButton
              action="reparse_snapshot"
              payload={{ snapshot_id: status.latest_snapshot.snapshot_id }}
            >
              {t("reparseSnapshot")}
            </AdminActionButton>
          )}
          <AdminActionButton
            action="cleanup_expired_agent_snapshots"
            confirmText={t("cleanupConfirm")}
          >
            {t("cleanupSnapshots")}
          </AdminActionButton>
          {status.review_snapshot_id && (
            <AdminActionButton
              action="approve_inventory_snapshot"
              payload={{ snapshot_id: status.review_snapshot_id }}
              confirmText={t("approveDropConfirm")}
            >
              {t("approveDrop")}
            </AdminActionButton>
          )}
          {status.review_snapshot_id && (
            <AdminActionButton
              action="reject_inventory_snapshot"
              payload={{ snapshot_id: status.review_snapshot_id }}
              confirmText={t("rejectDropConfirm")}
            >
              {t("rejectDrop")}
            </AdminActionButton>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {t("noUnsafeControls")}
        </p>
      </section>
    </div>
  );
}
