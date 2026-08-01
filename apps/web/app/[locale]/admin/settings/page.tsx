import { getTranslations } from "next-intl/server";

import {
  AdminActionButton,
  SettingsForm,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminPageHeader,
  adminDefinitionListClasses,
  adminPageClasses,
  adminPanelClasses,
  formatAdminTime,
} from "@/features/admin/presentation";
import {
  loadAdminSecretStatuses,
  loadRuntimeSettings,
  requireAdminPageAccess,
} from "@/features/admin/server";
import { requireAppLocale } from "@/i18n/server-locale";

export default async function AdminSettingsPage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Admin" });
  const formatTime = (value: string | null) =>
    formatAdminTime(value, locale, t("notReported"));
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [version, secrets] = await Promise.all([
    loadRuntimeSettings(),
    loadAdminSecretStatuses(),
  ]);
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow={t("settingsEyebrow")}
        title={t("settingsTitle")}
        description={t("settingsDescription")}
      />
      <section className={adminPanelClasses}>
        <h2>{t("currentVersion", { version: version.version })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("createdBy", {
            creator: version.created_by_display,
            date: "",
          })}
          {formatTime(version.created_at)}
        </p>
        <SettingsForm version={version} />
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("rollback")}</h2>
        <p>{t("rollbackDescription")}</p>
        {version.version > 1 && (
          <AdminActionButton
            action="settings_rollback"
            payload={{ expected_version: version.version }}
            confirmText={t("rollbackConfirm")}
          >
            {t("rollbackPrevious")}
          </AdminActionButton>
        )}
      </section>
      <section className={adminPanelClasses}>
        <h2>{t("secretStatus")}</h2>
        <dl className={adminDefinitionListClasses}>
          {secrets.map((secret) => (
            <div key={secret.name} className="contents">
              <dt>{secret.name}</dt>
              <dd>
                {secret.status} · {formatTime(secret.last_checked_at)}
              </dd>
            </div>
          ))}
          <dt>{t("browserValue")}</dt>
          <dd>{t("neverReturned")}</dd>
        </dl>
      </section>
    </div>
  );
}
