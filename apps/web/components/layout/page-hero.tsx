import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  visual,
  className,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  visual?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[1.75rem] border border-glass-border bg-[linear-gradient(135deg,rgb(255_255_255_/_0.88),rgb(226_247_255_/_0.72),rgb(234_248_224_/_0.76))] p-6 shadow-soft sm:p-8",
        className,
      )}
    >
      <div className="relative z-10 max-w-3xl">
        {eyebrow ? (
          <p className="text-xs font-bold tracking-[0.16em] text-primary uppercase">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
            {description}
          </p>
        ) : null}
        {actions ? (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {actions}
          </div>
        ) : null}
      </div>
      {visual ? (
        <div className="relative z-10 mt-6 sm:absolute sm:inset-y-0 sm:right-6 sm:mt-0">
          {visual}
        </div>
      ) : null}
      <span
        aria-hidden="true"
        className="absolute -right-16 -top-20 size-56 rounded-full bg-sky/20 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-24 left-1/3 size-52 rounded-full bg-leaf/15 blur-3xl"
      />
    </section>
  );
}
