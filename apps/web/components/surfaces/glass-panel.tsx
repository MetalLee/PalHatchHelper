import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function GlassPanel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-glass-border bg-glass p-5 shadow-soft backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}
