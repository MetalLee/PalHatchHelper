import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const rankStyles: Record<string, string> = {
  "1": "border-[#f7fbff] text-white",
  "2": "border-[#ffdd00] text-[#ffdd00]",
  "3": "border-[#ffdd00] text-[#ffdd00]",
  "4": "border-[#68ffd8] text-[#68ffd8]",
  "5": "border-[#68ffd8] text-[#68ffd8]",
  negative: "border-[#ff6b78] text-[#ff7884]",
  unknown: "border-[#8d9a9e] text-[#d9e1e3]",
};

function rankKey(rank: number | null): string {
  if (rank === null) return "unknown";
  if (rank <= -1) return "negative";
  if (rank >= 1 && rank <= 5) return String(rank);
  return "unknown";
}

export function PassiveBadge({
  name,
  rank,
  isNegative = null,
  className,
}: Readonly<{
  name: string;
  rank: number | null;
  isNegative?: boolean | null;
  className?: string;
}>) {
  const key = rankKey(rank);
  const negative = (rank !== null && rank <= -1) || isNegative === true;
  return (
    <Badge
      variant="outline"
      data-rank={key}
      title={name}
      aria-label={negative ? `${name}，负面被动` : undefined}
      className={cn(
        "passive-badge relative isolate z-0 min-h-7 max-w-full overflow-hidden rounded-md border border-l-4 bg-[#202729] px-2.5 py-1 font-semibold tracking-[0.01em] text-ellipsis whitespace-nowrap shadow-sm",
        rankStyles[key],
        className,
      )}
    >
      {name}
    </Badge>
  );
}
