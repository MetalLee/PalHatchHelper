"use client";

import type { UserContext } from "@palhatch/contracts";

import { PageError } from "@/components/states/page-error";
import { useCopy } from "@/i18n/client";

export function hasAdminRole(context: Pick<UserContext, "role">): boolean {
  return context.role === "admin";
}

export function AdminAccessDenied() {
  const t = useCopy("Admin");
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-2xl place-items-center p-4">
      <PageError
        code="ADMIN_ACCESS_DENIED"
        title={t("deniedTitle")}
        description={t("deniedDescription")}
        headingLevel="h1"
      />
    </main>
  );
}
