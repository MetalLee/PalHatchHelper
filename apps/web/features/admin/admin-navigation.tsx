import {
  Activity,
  Database,
  FileSearch,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "管理员概览", icon: LayoutDashboard },
  { href: "/admin/bindings", label: "玩家绑定", icon: Users },
  { href: "/admin/save-parser", label: "存档与 Parser", icon: FileSearch },
  { href: "/admin/breeding-data", label: "配种数据", icon: Database },
  { href: "/admin/jobs", label: "任务与 AI", icon: Activity },
  { href: "/admin/settings", label: "系统设置", icon: Settings },
] as const;

export function AdminNavigation({
  activePath,
}: Readonly<{ activePath: string }>) {
  return (
    <nav
      className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      aria-label="管理员导航"
    >
      {items.map((item) => {
        const active =
          activePath === item.href ||
          (item.href !== "/admin" && activePath.startsWith(`${item.href}/`));
        const Icon = item.icon;
        return (
          <Link
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-white/55 px-3.5 text-sm font-semibold text-muted-foreground no-underline transition-colors",
              "hover:border-primary/25 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
              active &&
                "border-primary/20 bg-accent text-accent-foreground shadow-sm",
            )}
            aria-current={active ? "page" : undefined}
            href={item.href}
            prefetch={false}
            key={item.href}
          >
            <Icon aria-hidden="true" className="size-4" strokeWidth={1.8} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
