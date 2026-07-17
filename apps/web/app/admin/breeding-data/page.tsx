import {
  CatalogUploadActions,
  CatalogUploadGuard,
  CatalogVersionActions,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminEmpty,
  AdminPageHeader,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminCatalogWorkspace,
  requireAdminPageAccess,
} from "@/features/admin/server";

export default async function AdminBreedingDataPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const { versions, sources, worlds, uploads } =
    await loadAdminCatalogWorkspace();
  return (
    <div className="page-stack">
      <AdminPageHeader
        eyebrow="IMMUTABLE GAME CATALOG"
        title="配种数据"
        description="历史版本不可修改；发布与回滚只使用已验证目录和明确确认。浏览器永不持有 Service Role。"
      />
      <section className="admin-card">
        <h2>上传标准化目录包</h2>
        <CatalogUploadGuard sources={sources} />
        <p className="text-sm text-slate-400">
          禁止 PAK、UTOC、UCAS、USMAP、存档、DLL、EXE、图像和音频。Agent
          会再次执行白名单、大小、SHA-256、manifest 和七类关系校验。
        </p>
      </section>
      <section className="admin-card">
        <h2>上传与操作队列</h2>
        {uploads.length === 0 ? (
          <AdminEmpty>暂无上传。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>文件 / 来源</th>
                  <th>状态</th>
                  <th>包 SHA-256</th>
                  <th>结果</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.upload_id}>
                    <td>
                      {upload.filename}
                      <br />
                      <small>
                        {upload.source ?? "—"} ·{" "}
                        {formatAdminTime(upload.created_at)}
                      </small>
                    </td>
                    <td>
                      <StatusPill state={upload.status} />
                    </td>
                    <td>
                      <small>{upload.package_sha256}</small>
                      <br />
                      {upload.size_bytes} bytes
                    </td>
                    <td>
                      {upload.staged_version_id ??
                        String(upload.validation_summary.outcome ?? "—")}
                    </td>
                    <td>
                      <CatalogUploadActions upload={upload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="admin-card">
        <h2>目录版本</h2>
        {versions.length === 0 ? (
          <AdminEmpty>暂无目录版本。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>版本 / 包</th>
                  <th>Build / 游戏版本</th>
                  <th>状态 / 世界</th>
                  <th>七类计数</th>
                  <th>来源 / Provenance / Diff</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.version_id}>
                    <td>
                      {version.version_id}
                      <br />
                      <small>content {version.content_hash}</small>
                      <br />
                      <small>package {version.package_hash}</small>
                      <br />
                      <small>{formatAdminTime(version.imported_at)}</small>
                    </td>
                    <td>
                      {version.build ?? "—"}
                      <br />
                      {version.game_version ?? "—"}
                    </td>
                    <td>
                      <StatusPill state={version.validation_state} />
                      <br />
                      {version.published_world ?? "—"}
                      <br />
                      <small>
                        previous {version.previous_version_id ?? "—"}
                      </small>
                    </td>
                    <td>
                      {Object.entries(version.counts).map(([key, count]) => (
                        <div key={key}>
                          {key}: {count}
                        </div>
                      ))}
                    </td>
                    <td>
                      {version.source ?? "—"}
                      <br />
                      <small>
                        provenance{" "}
                        {Object.keys(version.provenance).length
                          ? "已记录"
                          : "未记录"}
                      </small>
                      <br />
                      <small>
                        diff{" "}
                        {Object.keys(version.diff_summary).length
                          ? JSON.stringify(version.diff_summary)
                          : "—"}
                      </small>
                    </td>
                    <td>
                      <CatalogVersionActions
                        version={version}
                        worlds={worlds}
                      />
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
