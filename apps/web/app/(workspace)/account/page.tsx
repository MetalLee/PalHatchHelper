import { ErrorState } from "@/components/page-state";
import { requireUserContext } from "@/features/auth/server";

import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const context = await requireUserContext();
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h1>账号</h1>
          <p>Supabase 会话与游戏角色绑定摘要。</p>
        </div>
        <SignOutButton />
      </header>
      <dl className="detail-grid">
        <div>
          <dt>显示名称</dt>
          <dd>{context.display_name}</dd>
        </div>
        <div>
          <dt>邮箱</dt>
          <dd>{context.email}</dd>
        </div>
        <div>
          <dt>账号角色</dt>
          <dd>{context.role === "admin" ? "管理员" : "普通玩家"}</dd>
        </div>
        <div>
          <dt>游戏角色</dt>
          <dd>{context.binding?.player_nickname ?? "未绑定"}</dd>
        </div>
        <div>
          <dt>公会</dt>
          <dd>{context.binding?.guild_name ?? "未绑定"}</dd>
        </div>
        <div>
          <dt>世界</dt>
          <dd>{context.binding?.world_name ?? "未绑定"}</dd>
        </div>
      </dl>
      {context.binding === null ? (
        <ErrorState code="PLAYER_BINDING_REQUIRED" />
      ) : null}
    </div>
  );
}
