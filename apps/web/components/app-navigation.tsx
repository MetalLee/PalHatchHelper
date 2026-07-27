import {
  ClipboardList,
  Database,
  Dna,
  House,
  Rabbit,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const workspaceNavigationItems: readonly NavigationItem[] = [
  { href: "/overview", label: "首页", icon: House },
  { href: "/pals", label: "帕鲁库存", icon: Rabbit },
  { href: "/breeder", label: "配种工作台", icon: Dna },
  { href: "/plans", label: "我的计划", icon: ClipboardList },
  { href: "/data-status", label: "数据状态", icon: Database },
];

const routeTitles = [
  { href: "/admin/bindings", label: "玩家绑定" },
  { href: "/admin/save-parser", label: "存档与 Parser" },
  { href: "/admin/breeding-data", label: "游戏数据" },
  { href: "/admin/jobs", label: "任务与 AI" },
  { href: "/admin/settings", label: "系统设置" },
  { href: "/admin", label: "管理中心" },
  { href: "/account", label: "账号" },
  ...workspaceNavigationItems,
] as const;

export function isNavigationItemActive(
  activePath: string,
  href: string,
): boolean {
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function currentPageTitle(activePath: string): string {
  return (
    routeTitles.find(({ href }) => isNavigationItemActive(activePath, href))
      ?.label ?? "工作台"
  );
}

export function AppNavigation({
  activePath,
  className,
}: Readonly<{ activePath: string; className?: string }>) {
  return (
    <nav
      aria-label="主导航"
      className={cn(
        "hidden min-w-0 items-center justify-center gap-1 lg:flex",
        className,
      )}
    >
      {workspaceNavigationItems.map((item) => {
        const active = isNavigationItemActive(activePath, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "nav-jelly inline-flex min-h-11 items-center gap-2 rounded-xl border border-transparent px-3.5 text-sm font-semibold text-muted-foreground no-underline transition-[color,background-color,border-color,box-shadow] duration-200",
              "hover:border-primary/15 hover:bg-accent hover:text-accent-foreground hover:shadow-sm focus-visible:border-primary/20 focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              active &&
                "border-primary/20 bg-primary/10 text-primary shadow-sm",
            )}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
