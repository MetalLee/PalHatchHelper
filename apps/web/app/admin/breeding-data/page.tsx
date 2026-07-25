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

export default async function AdminBreedingDataPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const { versions, sources, worlds, uploads } =
    await loadAdminCatalogWorkspace();
  return (
    <div className={adminPageClasses}>
      <AdminPageHeader
        eyebrow="IMMUTABLE GAME CATALOG"
        title="配种数据"
        description="历史版本不可修改；发布与回滚只使用已验证目录和明确确认。浏览器永不持有 Service Role。"
      />
      <section className={adminPanelClasses}>
        <h2>上传标准化目录包</h2>
        <CatalogUploadGuard sources={sources} />
        <p className="text-sm text-muted-foreground">
          禁止 PAK、UTOC、UCAS、USMAP、存档、DLL、EXE、图像和音频。Agent
          会再次执行白名单、大小、SHA-256、manifest 和七类关系校验。
        </p>
      </section>
      <section className={adminPanelClasses}>
        <h2>上传与操作队列</h2>
        {uploads.length === 0 ? (
          <AdminEmpty>暂无上传。</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[54rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>文件 / 来源</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>包 SHA-256</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>动作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {uploads.map((upload) => (
                  <TableRow key={upload.upload_id}>
                    <TableCell>
                      {upload.filename}
                      <br />
                      <small>
                        {upload.source ?? "—"} ·{" "}
                        {formatAdminTime(upload.created_at)}
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
        <h2>目录版本</h2>
        {versions.length === 0 ? (
          <AdminEmpty>暂无目录版本。</AdminEmpty>
        ) : (
          <div className={adminTableFrameClasses}>
            <Table className="min-w-[72rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>版本 / 包</TableHead>
                  <TableHead>Build / 游戏版本</TableHead>
                  <TableHead>状态 / 世界</TableHead>
                  <TableHead>七类计数</TableHead>
                  <TableHead>来源 / Provenance / Diff</TableHead>
                  <TableHead>动作</TableHead>
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
                      <small>{formatAdminTime(version.imported_at)}</small>
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
                        previous {version.previous_version_id ?? "—"}
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
