"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

interface ItemInventorySparklineProps {
  label: string;
  points: Array<number | null>;
  currentQuantity?: number;
  className?: string;
}

const WIDTH = 224;
const HEIGHT = 36;
const PADDING = 4;

export function ItemInventorySparkline({
  label,
  points,
  currentQuantity,
  className,
}: ItemInventorySparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const observedPointCount = points.filter(
    (value): value is number => value !== null,
  ).length;
  const displayPoints =
    currentQuantity !== undefined && observedPointCount <= 1
      ? points.map(() => currentQuantity)
      : points;
  const values = displayPoints.filter(
    (value): value is number => value !== null,
  );
  const minimum = values.length === 0 ? 0 : Math.min(...values);
  const maximum = values.length === 0 ? 0 : Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const denominator = Math.max(displayPoints.length - 1, 1);
  const segments: string[][] = [];
  let current: string[] = [];
  displayPoints.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) segments.push(current);
      current = [];
      return;
    }
    const x = PADDING + (index / denominator) * (WIDTH - PADDING * 2);
    const normalized = maximum === minimum ? 0.5 : (value - minimum) / span;
    const y = HEIGHT - PADDING - normalized * (HEIGHT - PADDING * 2);
    current.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  if (current.length > 0) segments.push(current);

  return (
    <div
      data-slot="chart"
      className={cn(
        "h-11 min-w-52 w-full overflow-hidden rounded-md bg-muted/30 px-0 py-1",
        className,
      )}
    >
      <svg
        role="img"
        aria-label={label}
        data-chart="line"
        data-point-count={points.length}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="size-full"
      >
        <title>{label}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              className="text-primary"
              stopColor="currentColor"
              stopOpacity="0.22"
            />
            <stop
              offset="100%"
              className="text-primary"
              stopColor="currentColor"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
        <line
          x1={PADDING}
          y1={HEIGHT - PADDING}
          x2={WIDTH - PADDING}
          y2={HEIGHT - PADDING}
          className="stroke-border"
          strokeWidth="1"
        />
        {segments.map((segment, index) => {
          const first = segment[0]?.split(",")[0] ?? String(PADDING);
          const last = segment.at(-1)?.split(",")[0] ?? String(WIDTH - PADDING);
          return (
            <path
              key={`area-${index}-${segment[0] ?? "empty"}`}
              d={`M ${segment.join(" L ")} L ${last},${HEIGHT - PADDING} L ${first},${HEIGHT - PADDING} Z`}
              fill={`url(#${gradientId})`}
            />
          );
        })}
        {segments.map((segment, index) => (
          <polyline
            // Each null sample intentionally starts a new segment so downtime is visible.
            key={`${index}-${segment[0] ?? "empty"}`}
            points={segment.join(" ")}
            fill="none"
            className="stroke-primary"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {segments.at(-1)?.at(-1) ? (
          <circle
            cx={segments.at(-1)!.at(-1)!.split(",")[0]}
            cy={segments.at(-1)!.at(-1)!.split(",")[1]}
            r="2.25"
            className="fill-primary stroke-background"
            strokeWidth="1.25"
          />
        ) : null}
      </svg>
    </div>
  );
}
