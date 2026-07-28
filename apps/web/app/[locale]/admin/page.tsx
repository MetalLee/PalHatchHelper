import { getTranslations } from "next-intl/server";

import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminEmpty,
  AdminPageHeader,
  AdminQuickLinks,
  adminDefinitionListClasses,
  adminGridClasses,
  adminPageClasses,
  adminPanelClasses,
  adminTableFrameClasses,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminAuditEvents,
  loadAdminOverview,
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

export default async function AdminOverviewPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [overview, audit] = await Promise.all([
    loadAdminOverview(),
    loadAdminAuditEvents(),
  ]);
  const workers = [
    ["Agent", overview.agent],
    ["Save Worker", overview.save_worker],
    ["Job Worker", overview.job_worker],
  ] as const;
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("overviewEyebrow")}
        title={t("overviewTitle")}
        description={t("overviewDescription")}
      />
      <AdminQuickLinks
        title={t("quickLinks")}
        labels={{
          bindings: {
            label: t("bindingsNav"),
            description: t("bindingsQuickDescription"),
          },
          saveParser: {
            label: t("saveParserNav"),
            description: t("saveParserQuickDescription"),
          },
          gameData: {
            label: t("gameDataNav"),
            description: t("gameDataQuickDescription"),
          },
          jobs: {
            label: t("jobsNav"),
            description: t("jobsQuickDescription"),
          },
          settings: {
            label: t("settingsNav"),
            description: t("settingsQuickDescription"),
          },
        }}
      />
      {overview.stale && (
        <section
          className={`${adminPanelClasses} border-amber-200 bg-amber-50/80`}
          role="status"
        >
          <p className="text-xs font-bold tracking-[0.16em] text-amber-800 uppercase">
            STALE
          </p>
          <p>{t("staleDescription")}</p>
        </section>
      )}
      <section className={adminGridClasses} aria-label={t("workerStatus")}>
        {workers.map(([name, worker]) => (
          <article className={adminPanelClasses} key={name}>
            <h2>{name}</h2>
            <dl className={adminDefinitionListClasses}>
              <dt>{t("status")}</dt>
              <dd>
                <StatusPill state={worker.state} />
              </dd>
              <dt>{t("lastHeartbeat")}</dt>
              <dd>{formatTime(worker.last_heartbeat_at)}</dd>
              <dt>{t("dataStale")}</dt>
              <dd>{worker.stale ? t("yes") : t("no")}</dd>
            </dl>
          </article>
        ))}
      </section>
      <section className={adminGridClasses}>
        <article className={adminPanelClasses}>
          <h2>{t("inventoryParser")}</h2>
          {overview.latest_successful_snapshot ? (
            <dl className={adminDefinitionListClasses}>
              <dt>{t("latestSnapshot")}</dt>
              <dd>
                <AdminCode>
                  {overview.latest_successful_snapshot.snapshot_id}
                </AdminCode>
              </dd>
              <dt>{t("syncTime")}</dt>
              <dd>
                {formatTime(overview.latest_successful_snapshot.captured_at)}
              </dd>
              <dt>{t("palQuantity")}</dt>
              <dd>{overview.latest_successful_snapshot.pal_count}</dd>
              <dt>Parser</dt>
              <dd>
                {overview.parser.name ?? t("notReported")} ·{" "}
                {overview.parser.version ?? "—"}
              </dd>
            </dl>
          ) : (
            <AdminEmpty>{t("noSnapshot")}</AdminEmpty>
          )}
        </article>
        <article className={adminPanelClasses}>
          <h2>{t("gameCatalog")}</h2>
          <dl className={adminDefinitionListClasses}>
            <dt>{t("versionId")}</dt>
            <dd>
              <AdminCode>
                {overview.catalog.version_id ?? t("notPublished")}
              </AdminCode>
            </dd>
            <dt>Build</dt>
            <dd>{overview.catalog.build ?? "—"}</dd>
            <dt>{t("gameVersion")}</dt>
            <dd>{overview.catalog.game_version ?? "—"}</dd>
            <dt>Content hash</dt>
            <dd>
              <AdminCode>{overview.catalog.content_hash ?? "—"}</AdminCode>
            </dd>
          </dl>
        </article>
        <article className={adminPanelClasses}>
          <h2>{t("jobQueue")}</h2>
          <dl className={adminDefinitionListClasses}>
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
        <article className={adminPanelClasses}>
          <h2>{t("aiDeployment")}</h2>
          <dl className={adminDefinitionListClasses}>
            <dt>Provider</dt>
            <dd>{overview.ai_provider.provider}</dd>
            <dt>{t("status")}</dt>
            <dd>
              <StatusPill state={overview.ai_provider.state} />
            </dd>
            <dt>{t("degraded")}</dt>
            <dd>{overview.ai_provider.degraded ? t("yes") : t("no")}</dd>
            <dt>{t("disk")}</dt>
            <dd>
              <StatusPill state={overview.disk.level} />
            </dd>
            <dt>{t("availableSpace")}</dt>
            <dd>
              {overview.disk.available_bytes === null
                ? t("notReported")
                : `${Math.floor(overview.disk.available_bytes / 1_048_576)} MiB`}
            </dd>
            <dt>{t("deploymentVersion")}</dt>
            <dd>{overview.deployment_version}</dd>
          </dl>
        </article>
      </section>
      {overview.recent_failure && (
        <section
          className={`${adminPanelClasses} border-rose-200 bg-rose-50/80`}
        >
          <h2>{t("recentFailureSummary")}</h2>
          <p>
            <StatusPill state={overview.recent_failure.error_code} /> ·{" "}
            {overview.recent_failure.summary}
          </p>
          <small>{formatTime(overview.recent_failure.occurred_at)}</small>
        </section>
      )}
      <section className={adminPanelClasses}>
        <h2>{t("recentAudit")}</h2>
        {audit.length === 0 ? (
          <AdminEmpty>{t("noAudit")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("time")}</TableHead>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("actor")}</TableHead>
                  <TableHead>{t("target")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.slice(0, 20).map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell>{formatTime(event.created_at)}</TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell>{event.actor_display}</TableCell>
                    <TableCell>
                      {event.target_type} · {event.target_id ?? "—"}
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
