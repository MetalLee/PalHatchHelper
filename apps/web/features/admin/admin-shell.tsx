"use client";

import type { ReactNode } from "react";

import { PageHero } from "@/components/layout/page-hero";
import { useCopy } from "@/i18n/client";
import { usePathname } from "@/i18n/navigation";

import { AdminNavigation } from "./admin-navigation";

export function AdminShell({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const t = useCopy("Admin");
  return (
    <div className="grid min-w-0 gap-5">
      <PageHero
        eyebrow={t("shellEyebrow")}
        title={t("shellTitle")}
        description={t("shellDescription")}
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
