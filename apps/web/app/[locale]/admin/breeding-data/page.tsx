import { getTranslations } from "next-intl/server";

import {
  CatalogUploadActions,
  CatalogUploadGuard,
  CatalogVersionActions,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminEmpty,
  AdminPageHeader,
  adminPageClasses,
  adminPanelClasses,
  adminTableFrameClasses,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminCatalogWorkspace,
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

export default async function AdminBreedingDataPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const { versions, sources, worlds, uploads } =
    await loadAdminCatalogWorkspace();
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("gameDataEyebrow")}
        title={t("gameDataTitle")}
        description={t("gameDataDescription")}
      />
      <section className={adminPanelClasses}>
        <h2>{t("uploadCatalog")}</h2>
        <CatalogUploadGuard sources={sources} />
        <p className="text-sm text-muted-foreground">{t("uploadRules")}</p>
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("uploadQueue")}</h2>
        {uploads.length === 0 ? (
          <AdminEmpty>{t("noUploads")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[54rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fileSource")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("packageHash")}</TableHead>
                  <TableHead>{t("result")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((upload) => (
                  <TableRow key={upload.upload_id}>
                    <TableCell>
                      {upload.filename}
                      <br />
                      <small>
                        {upload.source ?? "—"} · {formatTime(upload.created_at)}
                      </small>
                    </TableCell>
                    <TableCell>
                      <StatusPill state={upload.status} />
                    </TableCell>
                    <TableCell>
                      <AdminCode>{upload.package_sha256}</AdminCode>
                      <br />
                      {upload.size_bytes} bytes
                    </TableCell>
                    <TableCell>
                      {upload.staged_version_id ??
                        String(upload.validation_summary.outcome ?? "—")}
                    </TableCell>
                    <TableCell>
                      <CatalogUploadActions upload={upload} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("catalogVersions")}</h2>
        {versions.length === 0 ? (
          <AdminEmpty>{t("noCatalogVersions")}</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[72rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("versionPackage")}</TableHead>
                  <TableHead>{t("buildGameVersion")}</TableHead>
                  <TableHead>{t("statusWorld")}</TableHead>
                  <TableHead>{t("sevenCounts")}</TableHead>
                  <TableHead>{t("sourceProvenanceDiff")}</TableHead>
                  <TableHead>{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {versions.map((version) => (
                  <TableRow key={version.version_id}>
                    <TableCell>
                      <AdminCode>{version.version_id}</AdminCode>
                      <small>content</small>
                      <AdminCode>{version.content_hash}</AdminCode>
                      <small>package</small>
                      <AdminCode>{version.package_hash}</AdminCode>
                      <br />
                      <small>{formatTime(version.imported_at)}</small>
                    </TableCell>
                    <TableCell>
                      {version.build ?? "—"}
                      <br />
                      {version.game_version ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill state={version.validation_state} />
                      <br />
                      {version.published_world ?? "—"}
                      <br />
                      <small>
                        {t("previous")} {version.previous_version_id ?? "—"}
                      </small>
                    </TableCell>
                    <TableCell>
                      {Object.entries(version.counts).map(([key, count]) => (
                        <div key={key}>
                          {key}: {count}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      {version.source ?? "—"}
                      <br />
                      <small>
                        provenance{" "}
                        {Object.keys(version.provenance).length
                          ? t("recorded")
                          : t("notRecorded")}
                      </small>
                      <br />
                      <small>
                        diff{" "}
                        {Object.keys(version.diff_summary).length
                          ? JSON.stringify(version.diff_summary)
                          : "—"}
                      </small>
                    </TableCell>
                    <TableCell>
                      <CatalogVersionActions
                        version={version}
                        worlds={worlds}
                      />
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
