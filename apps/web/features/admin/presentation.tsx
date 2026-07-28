import {
  Activity,
  ArrowRight,
  Database,
  FileSearch,
  Settings,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusChip, type StatusTone } from "@/components/status/status-chip";
import { Link } from "@/i18n/navigation";
import { catalogLocaleFor, type AppLocale } from "@/i18n/routing";

export const adminPageClasses =
  "mx-auto grid w-full min-w-0 max-w-[90rem] gap-5";
export const adminGridClasses = "grid min-w-0 gap-4 md:grid-cols-2";
export const adminPanelClasses =
  "min-w-0 rounded-2xl border border-glass-border bg-card/90 p-5 shadow-soft backdrop-blur-md [&>h2]:mb-4 [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-foreground [&>h3]:mb-3 [&>h3]:font-bold [&>h3]:text-foreground";
export const adminDefinitionListClasses =
  "grid min-w-0 grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)] gap-x-4 gap-y-3 [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words [&_dd]:text-foreground";
export const adminTableFrameClasses =
  "max-w-full overflow-x-auto rounded-2xl border border-border bg-white/68 [scrollbar-width:thin] [&>[data-slot=table-container]]:max-w-full";
export const adminActionsClasses = "flex min-w-0 flex-wrap gap-2";
export const adminActionStackClasses = "grid min-w-0 gap-2";
export const adminControlClasses =
  "min-h-11 min-w-11 max-w-full rounded-lg border border-input bg-white/82 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35";
export const adminFormClasses =
  "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-sm [&_label]:font-semibold [&_label]:text-muted-foreground [&_input:not([type=checkbox])]:min-h-11 [&_input:not([type=checkbox])]:min-w-0 [&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:rounded-lg [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-input [&_input:not([type=checkbox])]:bg-white/82 [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:py-2 [&_input:not([type=checkbox])]:text-sm [&_input:not([type=checkbox])]:font-normal [&_input:not([type=checkbox])]:text-foreground [&_select]:min-h-11 [&_select]:min-w-0 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-input [&_select]:bg-white/82 [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:font-normal [&_select]:text-foreground [&_textarea]:min-h-24 [&_textarea]:min-w-0 [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-input [&_textarea]:bg-white/82 [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-sm [&_textarea]:font-normal [&_textarea]:text-foreground";

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
    labelKey: "bindings",
    icon: Users,
  },
  {
    href: "/admin/save-parser",
    labelKey: "saveParser",
    icon: FileSearch,
  },
  {
    href: "/admin/breeding-data",
    labelKey: "gameData",
    icon: Database,
  },
  {
    href: "/admin/jobs",
    labelKey: "jobs",
    icon: Activity,
  },
  {
    href: "/admin/settings",
    labelKey: "settings",
    icon: Settings,
  },
] as const;

export function AdminQuickLinks({
  title,
  labels,
}: Readonly<{
  title: string;
  labels: Record<
    (typeof quickLinks)[number]["labelKey"],
    { label: string; description: string }
  >;
}>) {
  return (
    <section aria-labelledby="admin-quick-links-title">
      <h2
        id="admin-quick-links-title"
        className="mb-3 text-lg font-bold text-foreground"
      >
        {title}
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
              <strong className="mt-3 text-sm">
                {labels[item.labelKey].label}
              </strong>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {labels[item.labelKey].description}
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

export function formatAdminTime(
  value: string | null,
  locale: AppLocale,
  empty: string,
): string {
  if (value === null) return empty;
  return new Intl.DateTimeFormat(catalogLocaleFor(locale), {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
