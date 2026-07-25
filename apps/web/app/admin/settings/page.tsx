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

export default async function AdminSettingsPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const [version, secrets] = await Promise.all([
    loadRuntimeSettings(),
    loadAdminSecretStatuses(),
  ]);
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow="VERSIONED NON-SECRET SETTINGS"
        title="系统设置"
        description="这里只管理非秘密设置。密钥只显示 configured / not_configured 与最近检查时间，不返回值。"
      />
      <section className={adminPanelClasses}>
        <h2>当前版本 v{version.version}</h2>
        <p className="text-sm text-muted-foreground">
          创建者：{version.created_by_display} ·{" "}
          {formatAdminTime(version.created_at)}
        </p>
        <SettingsForm version={version} />
      </section>
      <section className={adminPanelClasses}>
        <h2>回滚</h2>
        <p>回滚会追加新版本，不修改或删除历史。</p>
        {version.version > 1 && (
          <AdminActionButton
            action="settings_rollback"
            payload={{ expected_version: version.version }}
            confirmText="回滚系统设置"
          >
            回滚上一个版本
          </AdminActionButton>
        )}
      </section>
      <section className={adminPanelClasses}>
        <h2>秘密配置状态</h2>
        <dl className={adminDefinitionListClasses}>
          {secrets.map((secret) => (
            <div key={secret.name} className="contents">
              <dt>{secret.name}</dt>
              <dd>
                {secret.status} · {formatAdminTime(secret.last_checked_at)}
              </dd>
            </div>
          ))}
          <dt>浏览器值</dt>
          <dd>永不返回</dd>
        </dl>
      </section>
    </div>
  );
}
