import { AdminActionButton } from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminPageHeader,
  formatAdminTime,
  StatusPill,
} from "@/features/admin/presentation";
import {
  loadAdminSaveParserStatus,
  requireAdminPageAccess,
} from "@/features/admin/server";

export default async function AdminSaveParserPage() {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const status = await loadAdminSaveParserStatus();
  return (
    <div className="page-stack">
      <AdminPageHeader
        eyebrow="READ-ONLY SAVE PIPELINE"
        title="存档与 Parser"
        description="管理员动作进入私有数据库命令队列；Agent 主动轮询，仅执行固定白名单。"
      />
      {status.stale && (
        <section
          className="admin-card border-amber-200 bg-amber-50/80"
          role="status"
        >
          STALE：Save Worker 心跳已过期。
        </section>
      )}
      <section className="admin-grid">
        <article className="admin-card">
          <h2>Save Worker</h2>
          <dl className="admin-kv">
            <dt>状态</dt>
            <dd>
              <StatusPill state={status.worker.state} />
            </dd>
            <dt>心跳</dt>
            <dd>{formatAdminTime(status.worker.last_heartbeat_at)}</dd>
            <dt>save root</dt>
            <dd>{status.save_root_configured ? "已配置" : "未配置"}</dd>
            <dt>只读挂载</dt>
            <dd>
              <StatusPill state={status.read_only_mount} />
            </dd>
          </dl>
        </article>
        <article className="admin-card">
          <h2>Parser</h2>
          <dl className="admin-kv">
            <dt>名称</dt>
            <dd>{status.parser.name ?? "—"}</dd>
            <dt>版本</dt>
            <dd>{status.parser.version ?? "—"}</dd>
            <dt>耗时</dt>
            <dd>
              {status.parse_duration_ms === null
                ? "—"
                : `${status.parse_duration_ms} ms`}
            </dd>
            <dt>帕鲁数量</dt>
            <dd>{status.pal_count ?? "—"}</dd>
          </dl>
        </article>
        <article className="admin-card">
          <h2>安全保护</h2>
          <dl className="admin-kv">
            <dt>库存下降</dt>
            <dd>
              <StatusPill state={status.inventory_drop_state} />
            </dd>
            <dt>磁盘</dt>
            <dd>
              <StatusPill state={status.disk.level} />
            </dd>
            <dt>保留数量</dt>
            <dd>{status.snapshot_retention_count}</dd>
            <dt>最新快照</dt>
            <dd>
              <AdminCode>
                {status.latest_snapshot?.snapshot_id ?? "—"}
              </AdminCode>
            </dd>
          </dl>
        </article>
        <article className="admin-card">
          <h2>最近失败</h2>
          {status.recent_failure ? (
            <div className="grid gap-2">
              <AdminCode>{status.recent_failure.error_code}</AdminCode>
              <p>{status.recent_failure.summary}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">暂无失败摘要。</p>
          )}
        </article>
      </section>
      <section className="admin-card">
        <h2>受控动作</h2>
        <div className="admin-actions">
          <AdminActionButton action="sync_save_once">
            请求安全同步
          </AdminActionButton>
          {status.latest_snapshot && (
            <AdminActionButton
              action="reparse_snapshot"
              payload={{ snapshot_id: status.latest_snapshot.snapshot_id }}
            >
              重新解析已有快照
            </AdminActionButton>
          )}
          <AdminActionButton
            action="cleanup_expired_agent_snapshots"
            confirmText="清理 Agent 旧快照"
          >
            清理超过保留期快照
          </AdminActionButton>
          {status.review_snapshot_id && (
            <AdminActionButton
              action="approve_inventory_snapshot"
              payload={{ snapshot_id: status.review_snapshot_id }}
              confirmText="接受异常库存下降"
            >
              接受异常下降
            </AdminActionButton>
          )}
          {status.review_snapshot_id && (
            <AdminActionButton
              action="reject_inventory_snapshot"
              payload={{ snapshot_id: status.review_snapshot_id }}
              confirmText="拒绝异常库存下降"
            >
              拒绝异常下降
            </AdminActionButton>
          )}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          不提供 shell、路径、Steam update、Docker 或 Palworld/mihomo 重启入口。
        </p>
      </section>
    </div>
  );
}
