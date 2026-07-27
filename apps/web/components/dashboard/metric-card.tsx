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
  compact = false,
  className,
}: Readonly<{
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
  tone?: "forest" | "sky" | "leaf";
  compact?: boolean;
  className?: string;
}>) {
  const toneClass = {
    forest: "bg-primary/10 text-primary",
    sky: "bg-sky/18 text-sky-900",
    leaf: "bg-leaf/16 text-forest",
  }[tone];

  return (
    <Card
      className={cn(
        "border-border/60 bg-card/90 shadow-soft",
        compact && "gap-0 py-0",
        className,
      )}
    >
      <CardContent
        className={cn(
          "flex items-center",
          compact ? "min-h-20 gap-3.5 px-4 py-3.5" : "gap-4 p-5",
        )}
      >
        <span
          className={cn(
            "grid shrink-0 place-items-center",
            compact ? "size-11 rounded-xl" : "size-12 rounded-2xl",
            toneClass,
          )}
        >
          <Icon
            aria-hidden="true"
            className={compact ? "size-5" : "size-6"}
            strokeWidth={1.8}
          />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">{label}</p>
          <p
            className={cn(
              "font-bold tabular-nums text-foreground",
              compact ? "mt-0.5 text-xl" : "mt-1 text-2xl",
            )}
          >
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
