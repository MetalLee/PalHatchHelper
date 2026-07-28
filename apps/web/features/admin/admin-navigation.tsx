"use client";

import {
  Activity,
  Database,
  FileSearch,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCopy } from "@/i18n/client";
import { Link, useRouter } from "@/i18n/navigation";

const items = [
  { href: "/admin", labelKey: "overviewNav", icon: LayoutDashboard },
  { href: "/admin/bindings", labelKey: "bindingsNav", icon: Users },
  { href: "/admin/save-parser", labelKey: "saveParserNav", icon: FileSearch },
  { href: "/admin/breeding-data", labelKey: "gameDataNav", icon: Database },
  { href: "/admin/jobs", labelKey: "jobsNav", icon: Activity },
  { href: "/admin/settings", labelKey: "settingsNav", icon: Settings },
] as const;

export function AdminNavigation({
  activePath,
}: Readonly<{ activePath: string }>) {
  const t = useCopy("Admin");
  const router = useRouter();
  const activeHref =
    items.find(
      (item) =>
        activePath === item.href ||
        (item.href !== "/admin" && activePath.startsWith(`${item.href}/`)),
    )?.href ?? "/admin";

  return (
    <nav className="min-w-0" aria-label={t("navigationLabel")}>
      <div className="md:hidden">
        <Select value={activeHref} onValueChange={(href) => router.push(href)}>
          <SelectTrigger
            className="w-full rounded-xl bg-white/75"
            aria-label={t("choosePage")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <SelectItem key={item.href} value={item.href}>
                  <Icon aria-hidden="true" className="size-4" />
                  {t(item.labelKey)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <Tabs value={activeHref} className="hidden min-w-0 md:flex">
        <div className="max-w-full overflow-x-auto pb-1 [scrollbar-width:thin]">
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
                    {t(item.labelKey)}
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
