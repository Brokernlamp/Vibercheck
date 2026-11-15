import {
  ANALYST_STATUS_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  TIERS,
  type Severity,
  type AuditTier,
} from "@/lib/domain";

const SEVERITY_STYLES: Record<Severity, string> = {
  CRITICAL: "bg-critical-soft text-critical border-critical/20",
  HIGH: "bg-high-soft text-high border-high/20",
  MEDIUM: "bg-medium-soft text-medium border-medium/20",
  LOW: "bg-low-soft text-low border-low/20",
  INFO: "bg-info-soft text-info border-info/20",
};

export function SeverityBadge({
  severity,
  dot = true,
}: {
  severity: Severity;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9px] font-medium uppercase tracking-[0.08em] ${SEVERITY_STYLES[severity]}`}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      )}
      {severity}
    </span>
  );
}

const TONE_STYLES: Record<string, string> = {
  neutral: "bg-paper-deep text-ink-soft border-line",
  blue: "bg-low-soft text-low border-low/20",
  amber: "bg-medium-soft text-medium border-medium/20",
  green: "bg-success-soft text-success border-success/20",
  red: "bg-critical-soft text-critical border-critical/20",
  violet: "bg-violet-soft text-violet border-violet/20",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold ${TONE_STYLES[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function TierBadge({ tier }: { tier: AuditTier }) {
  const details = TIERS[tier];
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-soft">
      {details.label}
      <span className="ml-1.5 font-normal text-muted">
        {details.cadence === "monthly" ? "monthly" : "one-time"}
      </span>
    </span>
  );
}

export function AnalystStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPEN: "bg-medium-soft text-medium border-medium/20",
    CONFIRMED: "bg-success-soft text-success border-success/20",
    DISMISSED: "bg-info-soft text-info border-info/20",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
        styles[status] ?? styles.OPEN
      }`}
    >
      {ANALYST_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

export function RiskGrade({ grade }: { grade: string }) {
  const colors: Record<string, string> = {
    A: "text-success",
    B: "text-success",
    C: "text-medium",
    D: "text-high",
    F: "text-critical",
  };
  return (
    <span className={`font-mono text-[11px] font-semibold ${colors[grade] ?? "text-ink"}`}>
      {grade}
    </span>
  );
}
