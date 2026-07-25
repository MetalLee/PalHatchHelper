import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "forest",
  className,
}: Readonly<{
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  tone?: "forest" | "sky" | "leaf";
  className?: string;
}>) {
  const toneClass = {
    forest: "bg-primary/10 text-primary",
    sky: "bg-sky/18 text-sky-900",
    leaf: "bg-leaf/16 text-forest",
  }[tone];

  return (
    <Card
      className={cn("border-glass-border bg-card/90 shadow-soft", className)}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-2xl",
            toneClass,
          )}
        >
          <Icon aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
            {value}
          </p>
          {detail ? (
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
