interface ItemInventorySparklineProps {
  label: string;
  points: Array<number | null>;
}

const WIDTH = 112;
const HEIGHT = 32;
const PADDING = 2;

export function ItemInventorySparkline({
  label,
  points,
}: ItemInventorySparklineProps) {
  const values = points.filter((value): value is number => value !== null);
  const minimum = values.length === 0 ? 0 : Math.min(...values);
  const maximum = values.length === 0 ? 0 : Math.max(...values);
  const span = Math.max(maximum - minimum, 1);
  const denominator = Math.max(points.length - 1, 1);
  const segments: string[][] = [];
  let current: string[] = [];
  points.forEach((value, index) => {
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
    <svg
      role="img"
      aria-label={label}
      data-point-count={points.length}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-8 w-28 overflow-visible"
    >
      <line
        x1={PADDING}
        y1={HEIGHT - PADDING}
        x2={WIDTH - PADDING}
        y2={HEIGHT - PADDING}
        className="stroke-border"
        strokeWidth="1"
      />
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
    </svg>
  );
}
