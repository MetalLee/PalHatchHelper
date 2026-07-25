import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function PageLoading({
  label = "正在加载",
  className,
}: Readonly<{ label?: string; className?: string }>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-glass-border bg-card/85 p-6 shadow-soft",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-2xl" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  );
}
