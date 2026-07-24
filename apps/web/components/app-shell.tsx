"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { SiteHeader } from "@/components/layout/site-header";
import type { StatusTone } from "@/components/status/status-chip";

export function AppShell({
  children,
  displayName,
  role,
  dataStatus,
}: Readonly<{
  children: ReactNode;
  displayName: string;
  role: "admin" | "player";
  dataStatus?: { label: string; tone: StatusTone };
}>) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <SiteHeader
        activePath={pathname}
        displayName={displayName}
        role={role}
        dataStatus={dataStatus}
      />
      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
