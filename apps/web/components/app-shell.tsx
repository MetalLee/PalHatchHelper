"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AppNavigation } from "./app-navigation";

export function AppShell({
  children,
  displayName,
}: Readonly<{ children: ReactNode; displayName: string }>) {
  const pathname = usePathname();
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <AppNavigation activePath={pathname} displayName={displayName} />
      <main id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
