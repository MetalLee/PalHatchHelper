import {
  AdminActionButton,
  BindingCreateForm,
  BindingUpdateForm,
} from "@/features/admin/admin-actions";
import { AdminAccessDenied } from "@/features/admin/access";
import {
  AdminCode,
  AdminEmpty,
  AdminPageHeader,
  formatAdminTime,
} from "@/features/admin/presentation";
import {
  loadAdminBindings,
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
            <Table className="min-w-[52rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>用户</TableHead>
                  <TableHead>角色</TableHead>
                  <TableHead>游戏玩家</TableHead>
                  <TableHead>世界 / 公会</TableHead>
                  <TableHead>版本</TableHead>
                  <TableHead>动作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.users.map((user) => (
                  <TableRow key={user.user_id}>
                    <TableCell>{user.user_display}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.player_nickname ?? "未绑定"}</TableCell>
                    <TableCell>
                      {user.world_name ?? "—"} / {user.guild_name ?? "—"}
                    </TableCell>
                    <TableCell>{user.binding_version ?? "—"}</TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section className="admin-card">
        <h2>绑定历史</h2>
        {data.events.length === 0 ? (
          <AdminEmpty>暂无绑定操作。</AdminEmpty>
        ) : (
          <div className="admin-table-wrap">
            <Table className="min-w-[48rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>事件</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>玩家</TableHead>
                  <TableHead>操作者</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.events.map((event) => (
                  <TableRow key={event.event_id}>
                    <TableCell>{formatAdminTime(event.created_at)}</TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell>
                      <AdminCode>{event.user_id}</AdminCode>
                    </TableCell>
                    <TableCell>
                      <AdminCode>{event.player_id ?? "—"}</AdminCode>
                    </TableCell>
                    <TableCell>{event.actor_display}</TableCell>
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
