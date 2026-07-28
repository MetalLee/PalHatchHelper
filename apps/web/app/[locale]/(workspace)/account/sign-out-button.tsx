"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppLocale, useCopy } from "@/i18n/client";

export function SignOutButton() {
  const locale = useAppLocale();
  const t = useCopy("Account");
  return (
    <Button
      variant="outline"
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
        window.location.assign(`/${locale}/login`);
      }}
    >
      <LogOut aria-hidden="true" className="size-4" />
      {t("signOut")}
    </Button>
  );
}
