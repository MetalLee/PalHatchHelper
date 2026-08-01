"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

interface ItemInventorySparklineProps {
  label: string;
  points: Array<number | null>;
  currentQuantity?: number;
  locale?: string;
  className?: string;
}

interface ChartCoordinate {
  index: number;
  value: number;
  x: number;
  y: number;
}

const WIDTH = 224;
const HEIGHT = 36;
const PADDING = 4;
const TOOLTIP_HEIGHT = 14;

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
  locale,
  className,
}: ItemInventorySparklineProps) {
  const gradientId = useId().replaceAll(":", "");
  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);
  const displayPoints = backfillLeadingSamples(points, currentQuantity);
  const values = displayPoints.filter(
    (value): value is number => value !== null,
  );
  const maximum = values.length === 0 ? 0 : Math.max(...values);
  const span = Math.max(maximum, 1);
  const denominator = Math.max(displayPoints.length - 1, 1);
  const coordinates: ChartCoordinate[] = [];
  displayPoints.forEach((value, index) => {
    if (value === null) return;
    const x = PADDING + (index / denominator) * (WIDTH - PADDING * 2);
    const normalized = value / span;
    const y = HEIGHT - PADDING - normalized * (HEIGHT - PADDING * 2);
    coordinates.push({ index, value, x, y });
  });
  const polylinePoints = coordinates
    .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const firstX = coordinates[0]?.x ?? PADDING;
  const lastX = coordinates.at(-1)?.x ?? WIDTH - PADDING;
  const activePoint = coordinates.find(
    ({ index }) => index === activePointIndex,
  );
  const activeValue = activePoint?.value.toLocaleString(locale);
  const tooltipWidth = Math.max(44, (activeValue?.length ?? 0) * 5.5 + 12);
  const tooltipX = activePoint
    ? Math.min(
        Math.max(activePoint.x - tooltipWidth / 2, PADDING),
        WIDTH - PADDING - tooltipWidth,
      )
    : 0;
  const tooltipY = activePoint
    ? activePoint.y > TOOLTIP_HEIGHT + PADDING * 2
      ? activePoint.y - TOOLTIP_HEIGHT - PADDING
      : activePoint.y + PADDING
    : 0;

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
            d={`M ${polylinePoints.replaceAll(" ", " L ")} L ${lastX},${HEIGHT - PADDING} L ${firstX},${HEIGHT - PADDING} Z`}
            fill={`url(#${gradientId})`}
          />
        ) : null}
        {coordinates.length > 0 ? (
          <polyline
            points={polylinePoints}
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
            cx={coordinates.at(-1)!.x}
            cy={coordinates.at(-1)!.y}
            r="2.25"
            className="fill-primary stroke-background"
            strokeWidth="1.25"
          />
        ) : null}
        {coordinates.map((coordinate) => (
          <circle
            key={coordinate.index}
            data-chart-point={coordinate.index}
            cx={coordinate.x}
            cy={coordinate.y}
            r="7"
            fill="transparent"
            className="cursor-crosshair"
            onMouseEnter={() => setActivePointIndex(coordinate.index)}
            onMouseLeave={() => setActivePointIndex(null)}
          />
        ))}
        {activePoint && activeValue ? (
          <g role="tooltip" data-chart-tooltip pointerEvents="none">
            <line
              x1={activePoint.x}
              y1={activePoint.y}
              x2={activePoint.x}
              y2={HEIGHT - PADDING}
              className="stroke-primary/35"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={activePoint.x}
              cy={activePoint.y}
              r="2.75"
              className="fill-primary stroke-background"
              strokeWidth="1.25"
            />
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={TOOLTIP_HEIGHT}
              rx="4"
              className="fill-foreground"
            />
            <text
              x={tooltipX + tooltipWidth / 2}
              y={tooltipY + 9.75}
              textAnchor="middle"
              className="fill-background text-[8px] font-semibold tabular-nums"
            >
              {activeValue}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
