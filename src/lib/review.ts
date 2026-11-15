import { soloMode } from "./env";
interface ReviewableFinding {
  analystStatus: "OPEN" | "CONFIRMED" | "DISMISSED";
}

export interface ReviewState {
  total: number;
  open: number;
  confirmed: number;
  dismissed: number;
  percent: number;
  triageComplete: boolean;
}

export function getReviewState(findings: ReviewableFinding[]): ReviewState {
  const total = findings.length;
  const open = findings.filter((finding) => finding.analystStatus === "OPEN").length;
  const confirmed = findings.filter(
    (finding) => finding.analystStatus === "CONFIRMED",
  ).length;
  const dismissed = findings.filter(
    (finding) => finding.analystStatus === "DISMISSED",
  ).length;
  const triaged = confirmed + dismissed;
  return {
    total,
    open,
    confirmed,
    dismissed,
    percent: total === 0 ? 100 : Math.round((triaged / total) * 100),
    triageComplete: open === 0,
  };
}

export interface FinalizeGateInput {
  findings: ReviewableFinding[];
  reviewCompletedAt: Date | null;
  reportStatus: "DRAFT" | "FINAL" | null;
  hasScan: boolean;
}

export interface FinalizeGateResult {
  ok: boolean;
  reasons: string[];
}

/**
 * FR-10: no report can be finalized without a completed analyst review. This
 * gate runs server-side on finalization, independently of UI affordances.
 */
export function canFinalizeReport({
  findings,
  reviewCompletedAt,
  reportStatus,
  hasScan,
}: FinalizeGateInput): FinalizeGateResult {
  // In solo mode, skip analyst review requirement
  if (soloMode()) {
    const reasons: string[] = [];
    if (!hasScan) reasons.push("The engagement has no completed scan.");
    if (reportStatus !== "DRAFT") reasons.push("There is no draft report to finalize.");
    return { ok: reasons.length === 0, reasons };
  }

  // Regular mode: enforce analyst gate
  const reasons: string[] = [];
  if (!hasScan) reasons.push("The engagement has no completed scan.");
  if (!reviewCompletedAt) reasons.push("Analyst review has not been completed.");
  if (reportStatus !== "DRAFT") reasons.push("There is no draft report to finalize.");
  const state = getReviewState(findings);
  if (!state.triageComplete) {
    reasons.push(
      `${state.open} finding${state.open === 1 ? "" : "s"} still need an analyst decision.`,
    );
  }
  return { ok: reasons.length === 0, reasons };
}
