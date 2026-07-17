"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AdminNavigation } from "./admin-navigation";

export function AdminShell({
  children,
  displayName,
}: Readonly<{ children: ReactNode; displayName: string }>) {
  const pathname = usePathname();
  return (
    <div className="admin-frame">
      <header className="admin-topbar">
        <div>
          <p className="eyebrow">PALHATCH CONTROL PLANE</p>
          <strong>管理员工作台</strong>
        </div>
        <div className="admin-identity">
          <span>{displayName}</span>
          <Link href="/overview">返回玩家工作台</Link>
        </div>
      </header>
      <AdminNavigation activePath={pathname} />
      <main className="admin-main" id="main-content">
        {children}
      </main>
    </div>
  );
}
