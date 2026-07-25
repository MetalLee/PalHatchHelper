"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button
      variant="outline"
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
        window.location.assign("/login");
      }}
    >
      <LogOut aria-hidden="true" className="size-4" />
      退出登录
    </Button>
  );
}
