import type { Engagement, Finding, Organization, ScanRun } from "@/db/schema";
import { computeRisk, severityRank } from "./scan/score";
import type { SeverityCounts } from "./scan/types";
import { OWASP_CATEGORIES, SEVERITY_ORDER, TIERS, type Severity } from "./domain";

export interface ScanComparison {
  previousScanId: string;
  previousSequence: number;
  resolvedCount: number;
  newCount: number;
  outstandingCount: number;
  scoreDelta: number;
  resolved: Array<{
    fingerprint: string;
    title: string;
    severity: Severity;
    filePath: string;
  }>;
}

export interface ReportFindingSnapshot {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  source: string;
  owasp: string;
  owaspLabel: string;
  category: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  description: string;
  remediation: string;
  confidence: number;
  analystComment: string | null;
  analystPriority: string | null;
  clientStatus: "OPEN" | "REMEDIATED";
}

export interface ReportPayload {
  schemaVersion: 1;
  reviewMode: "analyst" | "self-service";
  version: number;
  generatedAt: string;
  executiveSummary: string;
  techStack?: {
    declared: string | null;
    detected: string | null;
  } | null;
  engagement: {
    id: string;
    name: string;
    tier: string;
    tierLabel: string;
    repoUrl: string | null;
    sourceType: string;
    createdAt: string;
  };
  organization: { name: string };
  scan: {
    id: string;
    sequence: number;
    finishedAt: string | null;
    filesScanned: number;
    engineVersion: string;
    durationMs: number | null;
    score: number;
    grade: string;
    counts: SeverityCounts;
    comparison: ScanComparison | null;
  };
  findings: ReportFindingSnapshot[];
  counts: SeverityCounts;
  score: number;
  grade: string;
  analystNote: string | null;
  methodology: string[];
  limitations: string[];
  disclaimer: string;
}

export function reportableTitle(finding: Finding): string {
  return finding.analystTitle?.trim() || finding.title;
}

export function reportableDescription(finding: Finding): string {
  return finding.analystDescription?.trim() || finding.description;
}

export function reportableRemediation(finding: Finding): string {
  return finding.analystRemediation?.trim() || finding.remediation;
}

export function confirmedFindings(findings: Finding[]): Finding[] {
  return findings
    .filter((finding) => finding.analystStatus === "CONFIRMED")
    .sort((a, b) => {
      const severityDelta = severityRank(a.severity) - severityRank(b.severity);
      if (severityDelta !== 0) return severityDelta;
      return a.filePath.localeCompare(b.filePath);
    });
}

export interface SummaryFinding {
  title: string;
  analystTitle: string | null;
  description: string;
  analystDescription: string | null;
  severity: Severity;
  confidence: number;
  filePath: string;
  lineStart: number;
  analystStatus: "OPEN" | "CONFIRMED" | "DISMISSED";
}

function summaryTitle(finding: SummaryFinding): string {
  return finding.analystTitle?.trim() || finding.title;
}

function summaryDescription(finding: SummaryFinding): string {
  return finding.analystDescription?.trim() || finding.description;
}

export function buildExecutiveSummary({
  engagement,
  organizationName,
  findings,
  dismissedCount,
  filesScanned,
  finishedAt,
}: {
  engagement: Pick<Engagement, "name" | "tier">;
  organizationName: string;
  findings: SummaryFinding[];
  dismissedCount: number;
  filesScanned: number;
  finishedAt: Date | null;
}): string {
  const confirmed = findings
    .filter((finding) => finding.analystStatus === "CONFIRMED")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const risk = computeRisk(confirmed);
  const parts: string[] = [];

  parts.push(
    `${organizationName} commissioned VibeCheck to review ${engagement.name} under the ${TIERS[engagement.tier].label} tier. The review covered ${filesScanned} files of the repository and combined automated detection with a human analyst validation pass.`,
  );

  if (confirmed.length === 0) {
    parts.push(
      "No confirmed vulnerabilities were identified in the reviewed code. This reflects the specific rules, dependencies, and repository state examined at the time of the review; it is not a certification that the application is risk-free.",
    );
  } else {
    const counts = risk.counts;
    const severityLine = SEVERITY_ORDER.filter(
      (severity) => counts[severity] > 0,
    )
      .map((severity) => `${counts[severity]} ${severity.toLowerCase()}`)
      .join(", ");
    parts.push(
      `The analyst confirmed ${confirmed.length} finding${confirmed.length === 1 ? "" : "s"} (${severityLine}). The aggregate risk score is ${risk.score}/100 with a grade of ${risk.grade}, where 0 represents no observed risk and 100 represents severe, broad exposure.`,
    );

    const top = confirmed[0];
    parts.push(
      `The highest-priority issue is "${summaryTitle(top)}" in ${top.filePath}:${top.lineStart}. ${summaryDescription(top).split(/(?<=\.)\s/)[0] ?? summaryDescription(top)}`,
    );
  }

  if (dismissedCount > 0) {
    parts.push(
      `${dismissedCount} automated finding${dismissedCount === 1 ? " was" : "s were"} reviewed and dismissed as false positives or accepted risk, and are excluded from the confirmed findings below.`,
    );
  }

  if (finishedAt) {
    parts.push(
      `The scan snapshot was completed on ${finishedAt.toISOString().slice(0, 10)}. Generated code changes quickly; this report reflects the point-in-time state described above.`,
    );
  }

  return parts.join("\n\n");
}

export function buildDraftSummary({
  engagement,
  organizationName,
  findings,
  filesScanned,
  score,
  grade,
}: {
  engagement: Pick<Engagement, "name" | "tier">;
  organizationName: string;
  findings: SummaryFinding[];
  filesScanned: number;
  score: number;
  grade: string;
}): string {
  const counts = computeRisk(findings).counts;
  const top = [...findings].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity),
  )[0];
  const severityLine = SEVERITY_ORDER.filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity.toLowerCase()}`)
    .join(", ");
  const parts = [
    `Automated analysis of ${engagement.name} (${TIERS[engagement.tier].label}) inspected ${filesScanned} files and produced ${findings.length} preliminary findings: ${severityLine || "none"}.`,
    `The unreviewed draft risk score is ${score}/100 (grade ${grade}). This draft has not completed the mandatory analyst review and must not be delivered to the client.`,
  ];
  if (top) {
    parts.push(
      `The highest-priority preliminary issue is "${summaryTitle(top)}" in ${top.filePath}:${top.lineStart}. Analysts should validate it first.`,
    );
  }
  parts.push(
    `${organizationName} will see only the finalized report after every finding has been confirmed, dismissed, or added by an analyst.`,
  );
  return parts.join("\n\n");
}

export function buildSelfServiceSummary({
  engagement,
  organizationName,
  findings,
  filesScanned,
  finishedAt,
  score,
  grade,
}: {
  engagement: Pick<Engagement, "name" | "tier">;
  organizationName: string;
  findings: SummaryFinding[];
  filesScanned: number;
  finishedAt: Date;
  score: number;
  grade: string;
}): string {
  const candidates = findings
    .filter((finding) => finding.analystStatus !== "DISMISSED")
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  const counts = computeRisk(candidates).counts;
  const severityLine = SEVERITY_ORDER.filter((severity) => counts[severity] > 0)
    .map((severity) => `${counts[severity]} ${severity.toLowerCase()}`)
    .join(", ");
  const parts = [
    `The automated scan of ${engagement.name} for ${organizationName} inspected ${filesScanned} files and identified ${candidates.length} potential finding${candidates.length === 1 ? "" : "s"}${severityLine ? `: ${severityLine}` : ""}.`,
    `The scan score is ${score}/100 (grade ${grade}). Results are generated by automated checks and have not been validated by a human security analyst.`,
  ];

  if (candidates.length > 0) {
    const top = candidates[0];
    parts.push(
      `The highest-severity candidate is "${summaryTitle(top)}" in ${top.filePath}:${top.lineStart}. Review the code and context before deciding how to address it.`,
    );
  } else {
    parts.push(
      "No potential findings were detected by the enabled checks. This is not a guarantee that the project is free of security issues.",
    );
  }
  parts.push(
    `This point-in-time scan completed on ${finishedAt.toISOString().slice(0, 10)}. Re-scan after making changes to check whether detected issues remain.`,
  );
  return parts.join("\n\n");
}

export function buildReportPayload({
  engagement,
  organization,
  scan,
  findings,
  version,
  executiveSummary,
  analystNote,
  reviewMode = "analyst",
}: {
  engagement: Engagement;
  organization: Organization;
  scan: ScanRun;
  findings: Finding[];
  version: number;
  executiveSummary: string;
  analystNote: string | null;
  reviewMode?: "analyst" | "self-service";
}): ReportPayload {
  const intake = engagement.intake;
  const declaredStack =
    typeof intake.stack === "string" && intake.stack.trim()
      ? intake.stack.trim()
      : null;
  const detectedStack =
    typeof intake.detectedStack === "string" && intake.detectedStack.trim()
      ? intake.detectedStack.trim()
      : null;
  const reportFindings =
    reviewMode === "self-service"
      ? findings
          .filter((finding) => finding.analystStatus !== "DISMISSED")
          .sort((a, b) => {
            const severityDelta = severityRank(a.severity) - severityRank(b.severity);
            return severityDelta || a.filePath.localeCompare(b.filePath);
          })
      : confirmedFindings(findings);
  const severityOrder = new Map<Severity, number>(
    SEVERITY_ORDER.map((severity, index) => [severity, index]),
  );
  const snapshots: ReportFindingSnapshot[] = reportFindings
    .sort(
      (a, b) =>
        (severityOrder.get(a.severity) ?? 99) -
        (severityOrder.get(b.severity) ?? 99),
    )
    .map((finding) => ({
      id: finding.id,
      ruleId: finding.ruleId,
      title: reportableTitle(finding),
      severity: finding.severity,
      source: finding.source,
      owasp: finding.owasp,
      owaspLabel: OWASP_CATEGORIES[finding.owasp] ?? finding.owasp,
      category: finding.category,
      filePath: finding.filePath,
      lineStart: finding.lineStart,
      lineEnd: finding.lineEnd,
      snippet: finding.snippet,
      description: reportableDescription(finding),
      remediation: reportableRemediation(finding),
      confidence: finding.confidence,
      analystComment: finding.analystComment,
      analystPriority: finding.analystPriority,
      clientStatus: finding.clientStatus,
    }));
  const risk = computeRisk(reportFindings);

  return {
    schemaVersion: 1,
    reviewMode,
    version,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    techStack: { declared: declaredStack, detected: detectedStack },
    engagement: {
      id: engagement.id,
      name: engagement.name,
      tier: engagement.tier,
      tierLabel: TIERS[engagement.tier].label,
      repoUrl: engagement.repoUrl,
      sourceType: engagement.sourceType,
      createdAt: engagement.createdAt.toISOString(),
    },
    organization: { name: organization.name },
    scan: {
      id: scan.id,
      sequence: scan.sequence,
      finishedAt: scan.finishedAt?.toISOString() ?? null,
      filesScanned: scan.filesScanned,
      engineVersion: scan.engineVersion ?? "unknown",
      durationMs: scan.durationMs,
      score: risk.score,
      grade: risk.grade,
      counts: risk.counts,
      comparison: (scan.comparison as ScanComparison | null) ?? null,
    },
    findings: snapshots,
    counts: risk.counts,
    score: risk.score,
    grade: risk.grade,
    analystNote: reviewMode === "analyst" ? analystNote : null,
    methodology: [
      "Repository inventory and language-aware static analysis.",
      "Twenty-one named AI-code and MCP checks mapped to OWASP Top 10 categories.",
      "Credential detection with redacted evidence; raw secrets are never stored in findings.",
      "Dependency vulnerability review against live OSV advisories (GitHub Advisory, NVD, and ecosystem feeds), resolved from lockfile versions where present.",
      "Restrictive-license review of declared dependencies.",
      "Example, test, documentation, vendored, and generated paths are scanned but down-weighted.",
      ...(reviewMode === "analyst"
        ? ["Human analyst validation of every automated finding before publication."]
        : ["Automated findings are not human-validated; verify each result against the project context."]),
    ],
    limitations: [
      "This is a static review, not a penetration test; runtime, deployment, and social-engineering risks are out of scope.",
      "Dependency results reflect the versions resolved in the supplied lockfile or, when no lockfile is present, the minimum version allowed by each declared range. Transitive packages are covered only when a lockfile is supplied.",
      "Git history scanning is not performed; committed working-tree secrets are covered, but secrets removed from history are not.",
      "The review is a point-in-time assessment of the supplied repository and is not a guarantee of future security.",
      "This report does not constitute a compliance certification (SOC 2, ISO 27001, PCI DSS, or similar).",
    ],
    disclaimer:
      reviewMode === "analyst"
        ? "VibeCheck identifies and prioritizes security issues; it does not guarantee that a codebase is free of vulnerabilities. The scope, exclusions, and liability terms are governed by the signed client agreement. Remediation should be validated with a follow-up re-scan."
        : "This is an automated static analysis report, not a human security audit, penetration test, or certification. Automated checks can miss issues or report false positives. Validate findings and remediation independently; a clean result is not a guarantee that the codebase is secure.",
  };
}

export function summaryParagraphs(summary: string): string[] {
  return summary
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
