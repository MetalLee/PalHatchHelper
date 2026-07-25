import type { UserContext } from "@palhatch/contracts";

import { PageError } from "@/components/states/page-error";

export function hasAdminRole(context: Pick<UserContext, "role">): boolean {
  return context.role === "admin";
}

export function AdminAccessDenied() {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-2xl place-items-center p-4">
      <PageError
        code="ADMIN_ACCESS_DENIED"
        title="没有管理员权限"
        description="当前用户已登录，但服务器端角色验证未通过。"
        headingLevel="h1"
      />
    </main>
  );
}
