export function RiskTrend({
  points,
  width = 260,
  height = 68,
}: {
  points: Array<{ sequence: number; score: number; grade: string }>;
  width?: number;
  height?: number;
}) {
  if (points.length === 0) {
    return <div className="text-xs text-muted">No completed scans yet.</div>;
  }
  const padding = 8;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({
    x: padding + index * step,
    y: padding + usableHeight * (1 - point.score / 100),
    ...point,
  }));
  const path = coords
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const last = coords[coords.length - 1];
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Risk score trend across ${points.length} scans`}
      >
        <line
          x1={padding}
          y1={padding}
          x2={width - padding}
          y2={padding}
          stroke="var(--color-line)"
          strokeDasharray="2 4"
        />
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="var(--color-line)"
        />
        {points.length > 1 && (
          <path
            d={path}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        {coords.map((point) => (
          <g key={point.sequence}>
            <circle
              cx={point.x}
              cy={point.y}
              r={4}
              fill="var(--color-lime)"
              stroke="var(--color-forest)"
              strokeWidth="1.5"
            />
            <text
              x={point.x}
              y={Math.max(10, point.y - 9)}
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill="var(--color-muted)"
            >
              {point.score}
            </text>
          </g>
        ))}
        {last && (
          <text
            x={last.x}
            y={height - 0.5}
            textAnchor="end"
            fontSize="8"
            fontFamily="var(--font-mono)"
            fill="var(--color-muted)"
          >
            SCAN {last.sequence}
          </text>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between">
        <span className="mono-label text-[8px]">Higher is worse · 0–100</span>
        <span className="font-mono text-[9px] text-muted">
          {points.length} scan{points.length === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
