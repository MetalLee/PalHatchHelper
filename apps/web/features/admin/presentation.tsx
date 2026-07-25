import {
  Activity,
  ArrowRight,
  Database,
  FileSearch,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { StatusChip, type StatusTone } from "@/components/status/status-chip";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <header className="flex min-w-0 flex-col gap-4 rounded-2xl border border-glass-border bg-glass p-5 shadow-soft backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export function StatusPill({
  state,
}: Readonly<{ state: string | boolean | null }>) {
  const label = state === null ? "—" : String(state);
  const good = [
    "healthy",
    "normal",
    "published",
    "validated",
    "succeeded",
    "true",
    "active",
    "configured",
    "ok",
    "ready",
    "warm",
  ].includes(label);
  const danger =
    /failed|error|blocked|critical|denied|rejected|cancelled/i.test(label);
  const tone: StatusTone = good ? "good" : danger ? "danger" : "warning";
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

export function AdminEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/45 p-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function AdminCode({
  children,
  label,
}: Readonly<{ children: string; label?: string }>) {
  return (
    <code
      aria-label={label}
      className="block max-w-full select-all break-all rounded-lg bg-muted/65 px-2 py-1 font-mono text-xs leading-5 text-foreground"
      title={children}
    >
      {children}
    </code>
  );
}

const quickLinks = [
  {
    href: "/admin/bindings",
    label: "玩家绑定",
    description: "关联用户与游戏角色",
    icon: Users,
  },
  {
    href: "/admin/save-parser",
    label: "存档与 Parser",
    description: "检查只读同步管线",
    icon: FileSearch,
  },
  {
    href: "/admin/breeding-data",
    label: "配种数据版本",
    description: "审核和切换固定目录",
    icon: Database,
  },
  {
    href: "/admin/jobs",
    label: "任务与 AI",
    description: "诊断队列与降级状态",
    icon: Activity,
  },
  {
    href: "/admin/settings",
    label: "系统设置",
    description: "管理非秘密版本化设置",
    icon: Settings,
  },
] as const;

export function AdminQuickLinks() {
  return (
    <section aria-labelledby="admin-quick-links-title">
      <h2
        id="admin-quick-links-title"
        className="mb-3 text-lg font-bold text-foreground"
      >
        快捷入口
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex min-h-32 min-w-0 flex-col rounded-2xl border border-glass-border bg-card/90 p-4 text-foreground no-underline shadow-soft transition-colors hover:border-primary/25 hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
                <Icon aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </span>
              <strong className="mt-3 text-sm">{item.label}</strong>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="mt-auto size-4 self-end text-primary"
              />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function formatAdminTime(value: string | null): string {
  if (value === null) return "尚未上报";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
