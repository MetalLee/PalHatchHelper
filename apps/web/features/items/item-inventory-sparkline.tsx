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

function backfillLeadingSamples(
  points: readonly (number | null)[],
  currentQuantity?: number,
): Array<number | null> {
  const firstObservedIndex = points.findIndex((value) => value !== null);
  if (firstObservedIndex === -1) {
    return currentQuantity === undefined
      ? [...points]
      : points.map(() => currentQuantity);
  }

  const earliestQuantity = points[firstObservedIndex]!;
  return points.map((value, index) =>
    index < firstObservedIndex ? earliestQuantity : value,
  );
}

export function ItemInventorySparkline({
  label,
  points,
  currentQuantity,
  className,
}: ItemInventorySparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const displayPoints = backfillLeadingSamples(points, currentQuantity);
  const values = displayPoints.filter(
    (value): value is number => value !== null,
  );
  const maximum = values.length === 0 ? 0 : Math.max(...values);
  const span = Math.max(maximum, 1);
  const denominator = Math.max(displayPoints.length - 1, 1);
  const coordinates: string[] = [];
  displayPoints.forEach((value, index) => {
    if (value === null) return;
    const x = PADDING + (index / denominator) * (WIDTH - PADDING * 2);
    const normalized = value / span;
    const y = HEIGHT - PADDING - normalized * (HEIGHT - PADDING * 2);
    coordinates.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  });
  const firstX = coordinates[0]?.split(",")[0] ?? String(PADDING);
  const lastX = coordinates.at(-1)?.split(",")[0] ?? String(WIDTH - PADDING);

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
        {coordinates.length > 0 ? (
          <path
            d={`M ${coordinates.join(" L ")} L ${lastX},${HEIGHT - PADDING} L ${firstX},${HEIGHT - PADDING} Z`}
            fill={`url(#${gradientId})`}
          />
        ) : null}
        {coordinates.length > 0 ? (
          <polyline
            points={coordinates.join(" ")}
            fill="none"
            className="stroke-primary"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {coordinates.at(-1) ? (
          <circle
            cx={coordinates.at(-1)!.split(",")[0]}
            cy={coordinates.at(-1)!.split(",")[1]}
            r="2.25"
            className="fill-primary stroke-background"
            strokeWidth="1.25"
          />
        ) : null}
      </svg>
    </div>
  );
}
