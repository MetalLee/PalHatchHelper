import type { ReactNode } from "react";

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
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
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
  ].includes(label);
  return (
    <span className={good ? "admin-status admin-status-good" : "admin-status"}>
      {label}
    </span>
  );
}

export function AdminEmpty({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="admin-card text-slate-400">{children}</div>;
}

export function formatAdminTime(value: string | null): string {
  if (value === null) return "尚未上报";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}
