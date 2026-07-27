"use client";

import { LogOut, Menu, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import {
  currentPageTitle,
  isNavigationItemActive,
  workspaceNavigationItems,
} from "@/components/app-navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { brand } from "@/config/brand";

const subscribeToHydration = (): (() => void) => () => undefined;

export function MobileNavigation({
  activePath,
  displayName,
  role,
  onSignOut,
}: Readonly<{
  activePath: string;
  displayName: string;
  role: "admin" | "player";
  onSignOut: () => void;
}>) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 rounded-xl lg:hidden"
          aria-label="打开导航菜单"
          disabled={!hydrated}
        >
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(88vw,24rem)] border-glass-border bg-background/96 px-2 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
      >
        <SheetHeader className="px-3 pb-2 pt-[max(1rem,env(safe-area-inset-top))] text-left">
          <div className="flex items-center gap-3">
            <BrandLogo size={40} />
            <div>
              <SheetTitle>
                <BrandWordmark />
              </SheetTitle>
              <SheetDescription>
                {brand.productName} · 当前页面：{currentPageTitle(activePath)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <nav aria-label="移动端导航" className="grid gap-1 px-2">
          {workspaceNavigationItems.map((item) => {
            const active = isNavigationItemActive(activePath, item.href);
            const Icon = item.icon;
            return (
              <SheetClose asChild key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-muted-foreground no-underline transition-colors",
                    "hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                    active && "bg-accent text-accent-foreground",
                  )}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.8}
                  />
                  {item.label}
                </Link>
              </SheetClose>
            );
          })}
        </nav>

        <div className="mt-auto grid gap-1 border-t border-border px-2 pt-4">
          <p className="truncate px-4 pb-2 text-sm font-semibold text-foreground">
            {displayName}
          </p>
          {role === "admin" ? (
            <SheetClose asChild>
              <Link
                href="/admin"
                aria-current={
                  isNavigationItemActive(activePath, "/admin")
                    ? "page"
                    : undefined
                }
                className="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground"
              >
                <ShieldCheck aria-hidden="true" className="size-5" />
                管理中心
              </Link>
            </SheetClose>
          ) : null}
          <SheetClose asChild>
            <Link
              href="/account"
              aria-current={
                isNavigationItemActive(activePath, "/account")
                  ? "page"
                  : undefined
              }
              className="flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-semibold text-muted-foreground no-underline hover:bg-accent hover:text-accent-foreground"
            >
              <Settings aria-hidden="true" className="size-5" />
              账号
            </Link>
          </SheetClose>
          <SheetClose asChild>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-sm font-semibold text-destructive hover:bg-destructive/8"
              onClick={onSignOut}
            >
              <LogOut aria-hidden="true" className="size-5" />
              退出登录
            </button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
