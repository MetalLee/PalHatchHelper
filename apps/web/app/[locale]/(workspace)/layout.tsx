import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUserContext } from "@/features/auth/server";
import { dataStatusPresentation } from "@/features/data-status/presentation";
import { getInventoryDataStatus } from "@/features/pals/server";
import { requireAppLocale } from "@/i18n/server-locale";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const locale = requireAppLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "DataStatus" });
  const context = await requireUserContext();
  let dataStatus:
    | { label: string; tone: "good" | "warning" | "danger" }
    | undefined;

  if (context.binding !== null) {
    try {
      const status = await getInventoryDataStatus();
      const presentation = dataStatusPresentation(status.state, t);
      dataStatus = {
        label: presentation.title,
        tone: presentation.tone,
      };
    } catch {
      dataStatus = { label: t("dataUnavailable"), tone: "danger" };
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
