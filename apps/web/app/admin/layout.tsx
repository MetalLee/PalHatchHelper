import type { ReactNode } from "react";

import { AdminAccessDenied } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/admin-shell";
import { requireAdminPageAccess } from "@/features/admin/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (!(await requireAdminPageAccess())) return <AdminAccessDenied />;
  return <AdminShell displayName="管理员">{children}</AdminShell>;
}
