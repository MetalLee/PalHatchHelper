"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNavigation } from "./admin-navigation";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-glass-border bg-glass p-4 shadow-soft backdrop-blur-md sm:p-5">
        <div>
          <p className="eyebrow">PALHATCH ADMIN</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            管理中心
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理子页面沿用同一顶部导航，权限继续由服务端守卫验证。
          </p>
        </div>
        <AdminNavigation activePath={pathname} />
      </section>
      {children}
    </div>
  );
}
