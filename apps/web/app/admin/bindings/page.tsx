import {
  AdminActionButton,
  BindingCreateForm,
  BindingUpdateForm,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminEmpty,
  AdminPageHeader,
  formatAdminTime,
} from "@/features/admin/presentation";
import {
  loadAdminBindings,
  requireAdminPageAccess,
} from "@/features/admin/server";

export default async function AdminBindingsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const { q = "" } = await searchParams;
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  const data = await loadAdminBindings(q.slice(0, 120));
  return (
    <div className="page-stack">
      <AdminPageHeader
        eyebrow="IDENTITY LINKING"
        title="玩家绑定"
        description="Supabase 用户与游戏玩家保持双向唯一；所有修改均使用幂等键、乐观并发与不可变审计。"
      />
      <section className="admin-card">
        <form className="admin-actions" method="get">
          <input
            aria-label="搜索用户或玩家"
            name="q"
            defaultValue={q}
            placeholder="搜索安全显示名或玩家昵称"
          />
          <button className="secondary-button" type="submit">
            搜索
          </button>
        </form>
      </section>
      <section className="admin-card">
        <h2>创建绑定</h2>
        <BindingCreateForm users={data.users} players={data.players} />
      </section>
      <section className="admin-card">
        <h2>账号摘要</h2>
        {data.users.length === 0 ? (
          <AdminEmpty>没有匹配账号。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>角色</th>
                  <th>游戏玩家</th>
                  <th>世界 / 公会</th>
                  <th>版本</th>
                  <th>动作</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.user_id}>
                    <td>{user.user_display}</td>
                    <td>{user.role}</td>
                    <td>{user.player_nickname ?? "未绑定"}</td>
                    <td>
                      {user.world_name ?? "—"} / {user.guild_name ?? "—"}
                    </td>
                    <td>{user.binding_version ?? "—"}</td>
                    <td>
                      {user.binding_version === null ? (
                        "—"
                      ) : (
                        <div className="admin-action-stack">
                          <BindingUpdateForm
                            user={user}
                            players={data.players}
                          />
                          <AdminActionButton
                            action="binding_delete"
                            payload={{
                              user_id: user.user_id,
                              expected_version: user.binding_version,
                            }}
                            confirmText="解除绑定"
                          >
                            解除绑定
                          </AdminActionButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="admin-card">
        <h2>绑定历史</h2>
        {data.events.length === 0 ? (
          <AdminEmpty>暂无绑定操作。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>事件</th>
                  <th>用户</th>
                  <th>玩家</th>
                  <th>操作者</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => (
                  <tr key={event.event_id}>
                    <td>{formatAdminTime(event.created_at)}</td>
                    <td>{event.event_type}</td>
                    <td>{event.user_id}</td>
                    <td>{event.player_id ?? "—"}</td>
                    <td>{event.actor_display}</td>
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
