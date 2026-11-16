import { customRules } from "./rules";
import { secretRules } from "./secrets";
import { collectFiles } from "./files";
import { collectDependencies, scanDependencies } from "./sca";
import { lookupAdvisories, type OsvAdvisory } from "./osv";
import { osvOffline } from "../env";
import { classifyPath, tuneHeuristicFinding } from "./paths";
import { fingerprintFor } from "./fingerprint";
import { computeRisk, countSeverities, severityRank } from "./score";
import { redactSnippetText } from "./redact";
import { detectStack, formatDetectedStack } from "./detect-stack";
import { cweForRule } from "./cwe";
import { mergeSemgrepFindings, scanWithSemgrep, SEMGREP_RULESET_VERSION } from "./semgrep";
import { semgrepEnabled } from "../env";
import {
  DEFAULT_SCAN_LIMITS,
  ENGINE_VERSION,
  snippetAround,
  type FileContext,
  type RawFinding,
  type Rule,
  type ScanLimits,
  type ScanResult,
} from "./types";

export interface ScanOptions {
  /** Skip outbound OSV lookups (unit tests, air-gapped installs). */
  offline?: boolean;
  /** Override the opt-in Semgrep backend in tests or explicit scan callers. */
  semgrep?: boolean;
}

function toRawFinding(
  file: FileContext,
  rule: Rule,
  match: ReturnType<Rule["find"]>[number],
): RawFinding {
  const lineStart = Math.max(1, match.lineStart);
  const lineEnd = Math.max(lineStart, match.lineEnd ?? lineStart);
  const cwe = match.cwe ?? rule.cwe ?? cweForRule(rule.id);
  if (cwe.length === 0) {
    throw new Error(`Rule ${rule.id} is missing CWE metadata`);
  }
  return {
    ruleId: rule.id,
    source: rule.source,
    title: match.title ?? rule.title,
    severity: match.severity ?? rule.severity,
    cwe,
    owasp: match.owasp ?? rule.owasp,
    category: match.category ?? rule.category,
    filePath: file.path,
    lineStart,
    lineEnd,
    snippet: redactSnippetText(
      match.snippet ?? snippetAround(file.lines, lineStart, lineEnd),
    ),
    description: redactSnippetText(match.description ?? rule.description),
    remediation: match.remediation ?? rule.remediation,
    confidence: Math.max(
      0,
      Math.min(100, match.confidence ?? rule.confidence),
    ),
    fingerprint: fingerprintFor(rule.id, file.path, match.evidence),
  };
}

/**
 * Pattern matches and generic credential guesses are heuristics; a known token
 * format, a vulnerable dependency or a license obligation is evidence. Only the
 * heuristics are re-weighted by where the match lives.
 */
function isHeuristic(finding: Pick<RawFinding, "source" | "ruleId">): boolean {
  return finding.source === "CUSTOM" || finding.ruleId === "SEC-GENERIC-001";
}

/**
 * Whether a finding should move the headline risk score. Heuristic matches in
 * example, test, docs, vendored or generated paths are kept for triage but do
 * not describe the risk of what actually ships.
 */
export function countsTowardRisk(finding: {
  source: string;
  ruleId: string;
  filePath: string;
}): boolean {
  return (
    !isHeuristic(finding as Pick<RawFinding, "source" | "ruleId">) ||
    classifyPath(finding.filePath) === "production"
  );
}

/**
 * Heuristic rules describe patterns, not proofs. Where the file sits decides
 * how much a match means: example, test, docs and vendored code is down-weighted
 * so it cannot dominate a risk score or a client report.
 */
function applyPrecision(finding: RawFinding): RawFinding {
  if (!isHeuristic(finding)) return finding;
  const tuned = tuneHeuristicFinding(finding);
  if (!tuned.demoted) return finding;
  return { ...finding, confidence: tuned.confidence, severity: tuned.severity };
}

function prioritizeFindings(
  findings: RawFinding[],
  limit = DEFAULT_SCAN_LIMITS.maxFindings,
): { findings: RawFinding[]; truncated: boolean } {
  const unique = new Map<string, RawFinding>();
  for (const finding of findings) {
    const existing = unique.get(finding.fingerprint);
    if (!existing) {
      unique.set(finding.fingerprint, finding);
      continue;
    }
    const existingRank = severityRank(existing.severity);
    const candidateRank = severityRank(finding.severity);
    const shouldReplace =
      candidateRank < existingRank ||
      (candidateRank === existingRank && finding.confidence > existing.confidence) ||
      (candidateRank === existingRank &&
        finding.confidence === existing.confidence &&
        finding.filePath.localeCompare(existing.filePath) < 0) ||
      (candidateRank === existingRank &&
        finding.confidence === existing.confidence &&
        finding.filePath === existing.filePath &&
        finding.lineStart < existing.lineStart);
    if (shouldReplace) unique.set(finding.fingerprint, finding);
  }

  const sorted = [...unique.values()]
    .sort((a, b) => {
      const severityDelta = severityRank(a.severity) - severityRank(b.severity);
      if (severityDelta !== 0) return severityDelta;
      const confidenceDelta = b.confidence - a.confidence;
      if (confidenceDelta !== 0) return confidenceDelta;
      const pathDelta = a.filePath.localeCompare(b.filePath);
      if (pathDelta !== 0) return pathDelta;
      return a.lineStart - b.lineStart;
    });
  return {
    findings: sorted.slice(0, limit),
    truncated: sorted.length > limit,
  };
}

export async function scanDirectory(
  root: string,
  limits: ScanLimits = DEFAULT_SCAN_LIMITS,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const startedAt = Date.now();
  const collected = await collectFiles(root, limits);
  const files = collected.files;
  const warnings: string[] = [];
  let rawFindings: RawFinding[] = [];

  for (const file of files) {
    for (const rule of [...customRules, ...secretRules]) {
      if (rule.appliesTo && !rule.appliesTo(file)) continue;
      try {
        const matches = rule.find(file);
        for (const match of matches) {
          rawFindings.push(applyPrecision(toRawFinding(file, rule, match)));
        }
      } catch (error) {
        if (warnings.length < 20) {
          warnings.push(
            `${rule.id} failed on ${file.path}: ${
              error instanceof Error ? error.message : "unknown error"
            }`,
          );
        }
      }
    }
  }

  let advisories: Map<string, OsvAdvisory[]> | undefined;
  const dependencies = collectDependencies(files);
  const offline = options.offline ?? osvOffline();
  if (!offline && dependencies.length > 0) {
    try {
      const lookup = await lookupAdvisories(dependencies);
      warnings.push(...lookup.warnings);
      if (!lookup.failed) advisories = lookup.advisories;
    } catch (error) {
      warnings.push(
        `Live advisory lookup failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  try {
    rawFindings.push(...scanDependencies(files, { advisories }));
  } catch (error) {
    warnings.push(
      `Dependency scan failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  let engineVersion = ENGINE_VERSION;
  if (options.semgrep ?? semgrepEnabled()) {
    const semgrep = await scanWithSemgrep(files);
    warnings.push(...semgrep.warnings);
    rawFindings = mergeSemgrepFindings(
      rawFindings,
      semgrep.findings.map(applyPrecision),
    );
    if (semgrep.engineVersion) {
      engineVersion = `${ENGINE_VERSION}; Semgrep ${semgrep.engineVersion}; ${SEMGREP_RULESET_VERSION}`;
    }
  }

  const prioritized = prioritizeFindings(rawFindings, limits.maxFindings);
  const findings = prioritized.findings;
  const detectedStack = formatDetectedStack(detectStack(files));
  // The headline score answers "how risky is what ships?", so heuristic matches
  // in example, test, docs, vendored or generated code do not inflate it. They
  // stay in the finding list for the analyst to triage.
  const scored = findings.filter(countsTowardRisk);
  const risk = computeRisk(scored);
  const counts = countSeverities(findings);

  return {
    findings,
    filesScanned: files.length,
    bytesScanned: collected.bytesScanned,
    skippedFiles: collected.skippedFiles,
    truncated: collected.truncated || prioritized.truncated,
    durationMs: Date.now() - startedAt,
    engineVersion,
    score: risk.score,
    grade: risk.grade,
    counts,
    warnings,
    detectedStack: detectedStack || undefined,
  };
}

/**
 * Synchronous scan of in-memory files. Used by unit tests and by callers that
 * already hold file contents; dependency checks use the offline advisory set.
 */
export function scanFiles(files: FileContext[]): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const file of files) {
    for (const rule of [...customRules, ...secretRules]) {
      if (rule.appliesTo && !rule.appliesTo(file)) continue;
      for (const match of rule.find(file)) {
        findings.push(applyPrecision(toRawFinding(file, rule, match)));
      }
    }
  }
  findings.push(...scanDependencies(files));
  return prioritizeFindings(findings, DEFAULT_SCAN_LIMITS.maxFindings).findings;
}
