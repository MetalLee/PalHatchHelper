import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUserContext } from "@/features/auth/server";
import { getInventoryDataStatus } from "@/features/pals/server";
import { requireAppLocale } from "@/i18n/server-locale";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  requireAppLocale((await params).locale);
  const context = await requireUserContext();
  const supabase = await createServerSupabaseClient();
  const { data: steamIdentity } = await supabase
    .from("steam_identities")
    .select("avatar_url")
    .eq("user_id", context.user_id)
    .maybeSingle();
  let dataStatus: "unbound" | "latest" | "expired" = "unbound";

  if (context.binding !== null) {
    try {
      const status = await getInventoryDataStatus();
      dataStatus = status.state === "healthy" ? "latest" : "expired";
    } catch {
      dataStatus = "expired";
    }
  }

  return (
    <AppShell
      displayName={context.display_name}
      avatarUrl={steamIdentity?.avatar_url ?? null}
      role={context.role}
      dataStatus={dataStatus}
    >
      {children}
    </AppShell>
  );
}
