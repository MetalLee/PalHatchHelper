import { PageHero } from "@/components/layout/page-hero";
import { ErrorState } from "@/components/page-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireUserContext } from "@/features/auth/server";

import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const context = await requireUserContext();
  return (
    <div className="grid min-w-0 gap-6 pb-4 sm:gap-8">
      <PageHero
        eyebrow="Account"
        title="账号"
        description="查看当前 Supabase 会话与游戏角色绑定摘要。"
        actions={<SignOutButton />}
      />
      <Card className="border-glass-border bg-card/90 py-0 shadow-soft">
        <CardContent className="p-5 sm:p-6">
          <h2 className="text-xl font-bold text-foreground">账号与绑定信息</h2>
          <dl className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>显示名称</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">
                {context.display_name}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>邮箱</dt>
              <dd className="mt-1 break-all font-semibold text-foreground">
                {context.email}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>账号角色</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.role === "admin" ? "管理员" : "普通玩家"}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>游戏角色</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.player_nickname ?? "未绑定"}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>公会</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.guild_name ?? "未绑定"}
              </dd>
            </div>
            <div className="min-w-0 rounded-2xl bg-muted/55 p-4">
              <dt>世界</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {context.binding?.world_name ?? "未绑定"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {context.binding === null ? (
        <ErrorState code="PLAYER_BINDING_REQUIRED" headingLevel="h2" />
      ) : null}
    </div>
  );
}
