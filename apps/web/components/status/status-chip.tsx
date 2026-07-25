import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  XCircle,
} from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

const toneStyles = {
  good: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  danger: {
    icon: XCircle,
    className: "border-rose-200 bg-rose-50 text-rose-800",
  },
  neutral: {
    icon: CircleDashed,
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
} as const;

export type StatusTone = keyof typeof toneStyles;

export function StatusChip({
  tone = "neutral",
  children,
  className,
  ...props
}: ComponentProps<"span"> & { tone?: StatusTone }) {
  const style = toneStyles[tone];
  const Icon = style.icon;
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold",
        style.className,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
      {children}
    </span>
  );
}
