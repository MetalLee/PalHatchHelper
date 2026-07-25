"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { PageHero } from "@/components/layout/page-hero";

import { AdminNavigation } from "./admin-navigation";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="grid min-w-0 gap-5">
      <PageHero
        eyebrow="PALHATCH ADMIN"
        title="管理中心"
        description="查看真实运行摘要并执行受审计操作。权限由每次服务器请求验证，导航可见性不参与授权判断。"
        className="p-5 sm:p-7"
      />
      <section className="-mt-12 min-w-0 px-3 sm:px-5">
        <div className="relative z-20 rounded-2xl border border-glass-border bg-glass p-3 shadow-soft backdrop-blur-xl">
          <AdminNavigation activePath={pathname} />
        </div>
      </section>
      {children}
    </div>
  );
}
