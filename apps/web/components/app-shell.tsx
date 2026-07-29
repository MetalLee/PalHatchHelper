"use client";

import type { ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import type { StatusTone } from "@/components/status/status-chip";
import { useCopy } from "@/i18n/client";
import { usePathname } from "@/i18n/navigation";

export function AppShell({
  children,
  displayName,
  avatarUrl,
  role,
  dataStatus,
}: Readonly<{
  children: ReactNode;
  displayName: string;
  avatarUrl?: string | null;
  role: "admin" | "player";
  dataStatus?: { label: string; tone: StatusTone };
}>) {
  const t = useCopy("Common");
  const pathname = usePathname();
  return (
    <div className="min-h-dvh min-w-0 overflow-x-clip">
      <a
        className="fixed top-[-5rem] left-4 z-[100] rounded-xl bg-emerald-100 px-4 py-3 font-bold text-emerald-950 focus:top-4"
        href="#main-content"
      >
        {t("skipToContent")}
      </a>
      <SiteHeader
        activePath={pathname}
        displayName={displayName}
        avatarUrl={avatarUrl}
        role={role}
        dataStatus={dataStatus}
      />
      <main
        id="main-content"
        className="mx-auto min-h-[calc(100dvh-5.5rem)] w-full max-w-[90rem] px-4 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-7 lg:px-8 lg:pt-8"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  );
}
