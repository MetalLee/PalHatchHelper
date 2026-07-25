import { cn } from "@/lib/utils";

export function ForestScenery({
  variant = "hero",
  className,
}: Readonly<{
  variant?: "hero" | "page";
  className?: string;
}>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 isolate overflow-hidden select-none",
        className,
      )}
      data-testid={variant === "hero" ? "overview-scenery" : "login-scenery"}
      data-visual-source="css"
    >
      <div className="absolute inset-0 bg-[image:var(--forest-scenery-sky)]" />

      <div
        className={cn(
          "absolute rounded-full bg-white/75 blur-[1px] shadow-soft",
          variant === "page"
            ? "right-[8%] top-[12%] h-14 w-40 sm:h-20 sm:w-60"
            : "right-[9%] top-[12%] h-12 w-36 sm:h-16 sm:w-52",
        )}
      />
      <div
        className={cn(
          "absolute rounded-full bg-white/55 blur-[1px]",
          variant === "page"
            ? "left-[7%] top-[24%] h-10 w-28 sm:w-44"
            : "left-[42%] top-[20%] h-9 w-28",
        )}
      />

      <div
        className={cn(
          "absolute bottom-[20%] bg-sky/18 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
          variant === "page"
            ? "left-[4%] h-[34%] w-[48%]"
            : "right-[4%] h-[45%] w-[42%]",
        )}
      />
      <div
        className={cn(
          "absolute bottom-[18%] bg-primary/9 [clip-path:polygon(50%_0,100%_100%,0_100%)]",
          variant === "page"
            ? "right-[1%] h-[30%] w-[52%]"
            : "right-[29%] h-[33%] w-[34%]",
        )}
      />

      <div className="absolute -bottom-[18%] -left-[16%] h-[52%] w-[72%] rounded-[50%] bg-leaf/28" />
      <div className="absolute -bottom-[25%] right-[-18%] h-[58%] w-[78%] rounded-[50%] bg-primary/22" />
      <div className="absolute -bottom-[16%] left-[32%] h-[38%] w-[54%] rounded-[50%] bg-accent/90" />

      <div
        className={cn(
          "absolute bottom-[7%] left-[5%] rounded-[100%_0_100%_0] bg-primary/26",
          variant === "page" ? "h-32 w-24 sm:h-48 sm:w-36" : "h-20 w-14",
        )}
      />
      <div
        className={cn(
          "absolute bottom-[4%] right-[6%] rounded-[0_100%_0_100%] bg-leaf/34",
          variant === "page" ? "h-36 w-28 sm:h-52 sm:w-40" : "h-24 w-16",
        )}
      />

      <span className="absolute bottom-[13%] right-[25%] size-2 rounded-full bg-white shadow-[7px_2px_0_white,3px_8px_0_white]" />
      <span className="absolute bottom-[8%] left-[24%] size-2 rounded-full bg-white shadow-[6px_2px_0_white,2px_7px_0_white]" />
    </div>
  );
}
