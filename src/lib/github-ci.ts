import type { CiFailurePolicy, Severity } from "./domain";

export function blockingCiFindings<T extends { severity: Severity }>(
  policy: CiFailurePolicy,
  findings: T[],
): T[] {
  if (policy === "BLOCK_ANY") return findings;
  if (policy === "BLOCK_HIGH") {
    return findings.filter(
      (finding) =>
        finding.severity === "CRITICAL" || finding.severity === "HIGH",
    );
  }
  return [];
}

export function shouldFailGitHubCheck(
  policy: CiFailurePolicy,
  findings: Array<{ severity: Severity }>,
  incomplete = false,
): boolean {
  if (policy === "REPORT_ONLY") return false;
  return incomplete || blockingCiFindings(policy, findings).length > 0;
}
