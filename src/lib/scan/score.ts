import { SEVERITY_ORDER, SEVERITY_WEIGHT, type Severity } from "../domain";
import type { SeverityCounts } from "./types";

interface ScoredFinding {
  severity: Severity;
  confidence: number;
}

export function countSeverities(findings: ScoredFinding[]): SeverityCounts {
  const counts: SeverityCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return counts;
}

export function gradeForScore(score: number): string {
  if (score < 10) return "A";
  if (score < 25) return "B";
  if (score < 45) return "C";
  if (score < 65) return "D";
  return "F";
}

/**
 * Aggregate risk is 0-100, higher is worse. Confidence scales a finding's
 * contribution directly (a 50% confidence high counts half a confirmed high),
 * so pattern guesses cannot inflate the headline score the way they used to.
 */
export function computeRisk(findings: ScoredFinding[]): {
  score: number;
  grade: string;
  counts: SeverityCounts;
} {
  const counts = countSeverities(findings);
  let weighted = 0;
  for (const finding of findings) {
    const confidenceFactor = Math.min(100, Math.max(0, finding.confidence)) / 100;
    weighted += SEVERITY_WEIGHT[finding.severity] * confidenceFactor;
  }
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 * (1 - Math.exp(-weighted / 55)))),
  );
  return { score, grade: gradeForScore(score), counts };
}

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}
