import type { UserContext } from "@palhatch/contracts";

export function hasAdminRole(context: Pick<UserContext, "role">): boolean {
  return context.role === "admin";
}

export function AdminAccessDenied() {
  return (
    <main className="admin-access-denied" role="alert">
      <p className="eyebrow text-rose-700">ADMIN_ACCESS_DENIED</p>
      <h1>没有管理员权限</h1>
      <p>当前用户已登录，但服务器端角色验证未通过。</p>
    </main>
  );
}
