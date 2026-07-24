"use client";

import {
  ChevronDown,
  Database,
  LogOut,
  Settings,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import Link from "next/link";

import { AppNavigation, currentPageTitle } from "@/components/app-navigation";
import { MobileNavigation } from "@/components/layout/mobile-navigation";
import { StatusChip, type StatusTone } from "@/components/status/status-chip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function displayInitial(displayName: string): string {
  return Array.from(displayName.trim())[0]?.toUpperCase() ?? "P";
}

export function SiteHeader({
  activePath,
  displayName,
  role,
  dataStatus = { label: "查看数据状态", tone: "neutral" },
}: Readonly<{
  activePath: string;
  displayName: string;
  role: "admin" | "player";
  dataStatus?: { label: string; tone: StatusTone };
}>) {
  const signOut = (): void => {
    void fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
    }).finally(() => {
      window.location.assign("/login");
    });
  };

  return (
    <header className="sticky top-0 z-40 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5">
      <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center gap-3 rounded-[1.4rem] border border-glass-border bg-glass px-3 shadow-soft backdrop-blur-xl sm:px-4">
        <Link
          href="/overview"
          aria-label="PalHatch Helper 首页"
          className="flex min-w-0 items-center gap-2.5 rounded-xl text-foreground no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(145deg,var(--accent),white)] text-primary shadow-[inset_0_0_0_1px_rgb(40_122_84_/_0.12)]">
            <Sprout aria-hidden="true" className="size-6" strokeWidth={1.9} />
          </span>
          <span className="hidden min-w-0 xl:grid">
            <strong className="truncate text-sm font-bold tracking-[-0.01em]">
              PalHatch Helper
            </strong>
            <small className="truncate text-[0.68rem] text-muted-foreground">
              帕鲁配种助手
            </small>
          </span>
          <span className="grid min-w-0 lg:hidden">
            <strong className="truncate text-sm font-bold">
              PalHatch Helper
            </strong>
            <small className="truncate text-[0.68rem] text-muted-foreground">
              {currentPageTitle(activePath)}
            </small>
          </span>
        </Link>

        <AppNavigation activePath={activePath} className="mx-auto" />

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <Link
            href="/data-status"
            className="rounded-full no-underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <StatusChip tone={dataStatus.tone}>{dataStatus.label}</StatusChip>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 rounded-xl px-2.5"
                aria-label={`打开用户菜单，${displayName}`}
              >
                <Avatar className="size-8 border border-white shadow-sm">
                  <AvatarFallback className="bg-accent text-xs font-bold text-accent-foreground">
                    {displayInitial(displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-28 truncate">{displayName}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-xl">
              <DropdownMenuLabel>
                <span className="block truncate">{displayName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {role === "admin" ? "管理员" : "玩家"}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {role === "admin" ? (
                <DropdownMenuItem asChild>
                  <Link
                    href="/admin"
                    aria-current={
                      activePath.startsWith("/admin") ? "page" : undefined
                    }
                  >
                    <ShieldCheck aria-hidden="true" />
                    管理中心
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link
                  href="/account"
                  aria-current={activePath === "/account" ? "page" : undefined}
                >
                  <Settings aria-hidden="true" />
                  账号
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/data-status"
                  aria-current={
                    activePath === "/data-status" ? "page" : undefined
                  }
                >
                  <Database aria-hidden="true" />
                  数据状态
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={signOut}
              >
                <LogOut aria-hidden="true" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="ml-auto lg:hidden">
          <MobileNavigation
            activePath={activePath}
            displayName={displayName}
            role={role}
            onSignOut={signOut}
          />
        </div>
      </div>
    </header>
  );
}
