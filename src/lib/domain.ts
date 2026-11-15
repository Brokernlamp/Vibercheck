export const APP_NAME = "VibeCheck";
export const APP_TAGLINE = "Security review for code that shipped at AI speed.";

export type AuditTier = "QUICK_SCAN" | "FULL_AUDIT" | "CONTINUOUS_MONITORING";

export const TIERS: Record<
  AuditTier,
  {
    label: string;
    shortLabel: string;
    priceCents: number;
    cadence: "one-time" | "monthly";
    turnaround: string;
    blurb: string;
    includes: string[];
  }
> = {
  QUICK_SCAN: {
    label: "Quick Scan",
    shortLabel: "Quick",
    priceCents: 39900,
    cadence: "one-time",
    turnaround: "48 hours",
    blurb: "A fast, focused check before launch or fundraising.",
    includes: [
      "OWASP-mapped automated scan",
      "AI-code, secrets, and dependency checks",
      "Analyst validation of every finding",
      "Shareable web report",
    ],
  },
  FULL_AUDIT: {
    label: "Full Audit",
    shortLabel: "Full",
    priceCents: 250000,
    cadence: "one-time",
    turnaround: "5 business days",
    blurb: "Deep analyst review with remediation guidance and re-scan.",
    includes: [
      "Everything in Quick Scan",
      "Full analyst triage and commentary",
      "Prioritized remediation plan",
      "One verification re-scan",
      "Report version history",
    ],
  },
  CONTINUOUS_MONITORING: {
    label: "Continuous Monitoring",
    shortLabel: "Monitoring",
    priceCents: 49900,
    cadence: "monthly",
    turnaround: "Priority queue",
    blurb: "Audit once, then keep new AI-generated changes honest.",
    includes: [
      "Recurring scheduled re-scans",
      "PR-triggered checks (Phase 2 connector)",
      "Priority analyst turnaround",
      "Risk trend tracking",
    ],
  },
};

export const TIER_ORDER: AuditTier[] = [
  "QUICK_SCAN",
  "FULL_AUDIT",
  "CONTINUOUS_MONITORING",
];

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type CiFailurePolicy = "REPORT_ONLY" | "BLOCK_HIGH" | "BLOCK_ANY";
export const SEVERITY_ORDER: Severity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
];

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 25,
  HIGH: 10,
  MEDIUM: 4,
  LOW: 1.5,
  INFO: 0.3,
};

export const STATUS_LABELS: Record<string, string> = {
  INTAKE: "Intake",
  SCANNING: "Scanning",
  SCAN_FAILED: "Scan failed",
  UNDER_REVIEW: "Analyst review",
  READY_FOR_CLIENT: "Ready for review",
  DELIVERED: "Delivered",
  REMEDIATION: "Remediation",
  CLOSED: "Closed",
};

export const STATUS_TONE: Record<
  string,
  "neutral" | "blue" | "amber" | "green" | "red" | "violet"
> = {
  INTAKE: "neutral",
  SCANNING: "blue",
  SCAN_FAILED: "red",
  UNDER_REVIEW: "amber",
  READY_FOR_CLIENT: "violet",
  DELIVERED: "green",
  REMEDIATION: "amber",
  CLOSED: "neutral",
};

export const OWASP_CATEGORIES: Record<string, string> = {
  A01: "Broken Access Control",
  A02: "Cryptographic Failures",
  A03: "Injection",
  A04: "Insecure Design",
  A05: "Security Misconfiguration",
  A06: "Vulnerable & Outdated Components",
  A07: "Identification & Authentication Failures",
  A08: "Software & Data Integrity Failures",
  A09: "Security Logging & Monitoring Failures",
  A10: "Server-Side Request Forgery",
};

export const SOURCE_LABELS: Record<string, string> = {
  CUSTOM: "AI-code rules",
  SECRET: "Secrets",
  SCA: "Dependencies",
  LICENSE: "License",
  ANALYST: "Analyst",
};

export const ANALYST_STATUS_LABELS: Record<string, string> = {
  OPEN: "Needs review",
  CONFIRMED: "Confirmed",
  DISMISSED: "Dismissed",
};

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return "now";
}

/**
 * Route params are interpolated straight into uuid columns. A malformed id
 * must become a 404, not a Postgres error returned as a 500.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
