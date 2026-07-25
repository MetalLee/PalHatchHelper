import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUserContext } from "@/features/auth/server";
import { dataStatusPresentation } from "@/features/data-status/presentation";
import { getInventoryDataStatus } from "@/features/pals/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const context = await requireUserContext();
  let dataStatus:
    | { label: string; tone: "good" | "warning" | "danger" }
    | undefined;

  if (context.binding !== null) {
    try {
      const status = await getInventoryDataStatus();
      const presentation = dataStatusPresentation(status.state);
      dataStatus = {
        label: presentation.title,
        tone: presentation.tone,
      };
    } catch {
      dataStatus = { label: "状态暂不可用", tone: "danger" };
    }
  }

  return (
    <AppShell
      displayName={context.display_name}
      role={context.role}
      dataStatus={dataStatus}
    >
      {children}
    </AppShell>
  );
}
