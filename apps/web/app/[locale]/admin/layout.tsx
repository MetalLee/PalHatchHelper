import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { AdminAccessDenied } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/admin-shell";
import { requireAdminPageAccess } from "@/features/admin/server";
import { requireUserContext } from "@/features/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireUserContext();
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  return (
    <AppShell displayName={context.display_name} role={context.role}>
      <AdminShell>{children}</AdminShell>
    </AppShell>
  );
}
