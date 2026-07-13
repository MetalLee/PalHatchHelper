import type { ReactNode } from "react";

export type StatusBadgeStatus = "operational" | "degraded" | "offline";

const statusClasses: Record<StatusBadgeStatus, string> = {
  operational: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  degraded: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  offline: "border-rose-300/30 bg-rose-300/10 text-rose-200",
};

export function StatusBadge({
  status,
  children,
}: Readonly<{ status: StatusBadgeStatus; children: ReactNode }>) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium tracking-wide ${statusClasses[status]}`}
      data-status={status}
      role="status"
    >
      {children}
    </span>
  );
}
