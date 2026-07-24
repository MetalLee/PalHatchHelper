import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const rankStyles: Record<string, string> = {
  "1": "border-slate-200 bg-slate-50 text-slate-700",
  "2": "border-sky-200 bg-sky-50 text-sky-800",
  "3": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "4": "border-violet-200 bg-violet-50 text-violet-800",
  "5": "border-amber-300 bg-amber-50 text-amber-900",
  negative: "border-rose-200 bg-rose-50 text-rose-800",
  unknown: "border-slate-200 bg-slate-100 text-slate-600",
};

function rankKey(rank: number | null): string {
  if (rank === null) return "unknown";
  if (rank < 0) return "negative";
  if (rank >= 1 && rank <= 5) return String(rank);
  return "unknown";
}

export function PassiveBadge({
  name,
  rank,
  className,
}: Readonly<{ name: string; rank: number | null; className?: string }>) {
  const key = rankKey(rank);
  return (
    <Badge
      variant="outline"
      data-rank={key}
      aria-label={key === "negative" ? `${name}，负面被动` : undefined}
      className={cn(
        "min-h-7 rounded-lg px-2.5 py-1 font-semibold",
        rankStyles[key],
        className,
      )}
    >
      {name}
    </Badge>
  );
}
