import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUserContext } from "@/features/auth/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireUserContext();
  return <AppShell displayName={context.display_name}>{children}</AppShell>;
}
