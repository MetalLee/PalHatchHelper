import { Sprout } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageEmpty({
  title,
  description,
  action,
  className,
}: Readonly<{
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-glass-border bg-card/85 p-8 text-center shadow-soft",
        className,
      )}
    >
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent text-primary">
        <Sprout aria-hidden="true" className="size-7" />
      </span>
      <h2 className="mt-4 text-xl font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  );
}
