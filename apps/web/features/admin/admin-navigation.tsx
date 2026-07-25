import {
  Activity,
  Database,
  FileSearch,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const router = useRouter();
  const activeHref =
    items.find(
      (item) =>
        activePath === item.href ||
        (item.href !== "/admin" && activePath.startsWith(`${item.href}/`)),
    )?.href ?? "/admin";

  return (
    <nav className="min-w-0" aria-label="管理员导航">
      <div className="md:hidden">
        <Select value={activeHref} onValueChange={(href) => router.push(href)}>
          <SelectTrigger
            className="w-full rounded-xl bg-white/75"
            aria-label="选择管理页面"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <SelectItem key={item.href} value={item.href}>
                  <Icon aria-hidden="true" className="size-4" />
                  {item.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <Tabs value={activeHref} className="hidden min-w-0 md:flex">
        <div className="admin-nav-scroll">
          <TabsList
            variant="line"
            className="min-w-max justify-start gap-1 rounded-2xl border border-white/70 bg-white/45 p-1"
          >
            {items.map((item) => {
              const Icon = item.icon;
              const active = activeHref === item.href;
              return (
                <TabsTrigger
                  asChild
                  value={item.href}
                  key={item.href}
                  className="min-h-11 flex-none rounded-xl px-4 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  <Link
                    aria-current={active ? "page" : undefined}
                    href={item.href}
                    prefetch={false}
                  >
                    <Icon
                      aria-hidden="true"
                      className="size-4"
                      strokeWidth={1.8}
                    />
                    {item.label}
                  </Link>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </Tabs>
    </nav>
  );
}
