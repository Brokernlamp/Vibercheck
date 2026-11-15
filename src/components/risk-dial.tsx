export function RiskDial({
  score,
  grade,
  size = 132,
  label = "Risk score",
}: {
  score: number;
  grade: string;
  size?: number;
  label?: string;
}) {
  const color =
    score >= 65
      ? "var(--color-critical)"
      : score >= 45
        ? "var(--color-high)"
        : score >= 25
          ? "var(--color-medium)"
          : "var(--color-success)";
  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label} ${score} out of 100, grade ${grade}`}
    >
      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx="60"
          cy="60"
          r="51"
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="7"
        />
        <circle
          cx="60"
          cy="60"
          r="51"
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${Math.max(0.8, Math.min(100, score))} 100`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-serif text-[38px] leading-none tracking-[-0.05em]">
            {score}
          </div>
          <div className="mono-label mt-1 text-[8px]">{label}</div>
          <div className="mt-1 font-mono text-[10px] font-semibold" style={{ color }}>
            GRADE {grade}
          </div>
        </div>
      </div>
    </div>
  );
}
