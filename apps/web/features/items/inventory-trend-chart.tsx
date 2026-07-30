import type { ItemInventoryTrendPoint } from "@palhatch/contracts";

function chartPoints(points: readonly ItemInventoryTrendPoint[]): {
  polyline: string;
  minimum: number;
  maximum: number;
} {
  if (points.length === 0) return { polyline: "", minimum: 0, maximum: 0 };
  const quantities = points.map((point) => point.quantity);
  const minimum = Math.min(...quantities);
  const maximum = Math.max(...quantities);
  const span = Math.max(maximum - minimum, 1);
  const polyline = points
    .map((point, index) => {
      const x =
        points.length === 1 ? 300 : 24 + (index / (points.length - 1)) * 552;
      const y = 150 - ((point.quantity - minimum) / span) * 120;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return { polyline, minimum, maximum };
}

export function InventoryTrendChart({
  points,
  label,
  emptyLabel,
}: Readonly<{
  points: readonly ItemInventoryTrendPoint[];
  label: string;
  emptyLabel: string;
}>) {
  if (points.length === 0) {
    return (
      <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-muted/25 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }
  const chart = chartPoints(points);
  return (
    <figure className="min-w-0" aria-label={label}>
      <svg
        role="img"
        viewBox="0 0 600 180"
        className="h-auto w-full overflow-visible"
      >
        <title>{label}</title>
        <line x1="24" y1="30" x2="576" y2="30" className="stroke-border" />
        <line x1="24" y1="150" x2="576" y2="150" className="stroke-border" />
        <polyline
          points={chart.polyline}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />
        {points.map((point, index) => {
          const x =
            points.length === 1
              ? 300
              : 24 + (index / (points.length - 1)) * 552;
          const span = Math.max(chart.maximum - chart.minimum, 1);
          const y = 150 - ((point.quantity - chart.minimum) / span) * 120;
          return (
            <circle
              key={`${point.sampled_at}:${index}`}
              cx={x}
              cy={y}
              r="3.5"
              className="fill-primary"
            >
              <title>{`${point.sampled_at}: ${point.quantity}`}</title>
            </circle>
          );
        })}
        <text x="4" y="34" className="fill-muted-foreground text-[11px]">
          {chart.maximum.toLocaleString()}
        </text>
        <text x="4" y="154" className="fill-muted-foreground text-[11px]">
          {chart.minimum.toLocaleString()}
        </text>
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground">
        <time dateTime={points[0]!.sampled_at}>
          {points[0]!.sampled_at.slice(0, 10)}
        </time>
        <time dateTime={points.at(-1)!.sampled_at}>
          {points.at(-1)!.sampled_at.slice(0, 10)}
        </time>
      </figcaption>
    </figure>
  );
}
