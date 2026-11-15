import type { Severity } from "../domain";

export type RuleSource = "CUSTOM" | "SECRET" | "SCA" | "LICENSE";

export interface FileContext {
  /** Repository-relative path, always POSIX separators. */
  path: string;
  content: string;
  lines: string[];
  ext: string;
}

export interface RuleMatch {
  lineStart: number;
  lineEnd?: number;
  /** Stable evidence used to build a re-scan fingerprint. Never contains raw secrets. */
  evidence: string;
  /** Optional pre-rendered, redacted snippet. */
  snippet?: string;
  title?: string;
  severity?: Severity;
  confidence?: number;
  description?: string;
  remediation?: string;
  owasp?: string;
  category?: string;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  confidence: number;
  source: RuleSource;
  owasp: string;
  category: string;
  description: string;
  remediation: string;
  appliesTo?: (ctx: FileContext) => boolean;
  find: (ctx: FileContext) => RuleMatch[];
}

export interface RawFinding {
  ruleId: string;
  source: RuleSource;
  title: string;
  severity: Severity;
  owasp: string;
  category: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  description: string;
  remediation: string;
  confidence: number;
  fingerprint: string;
}

export type SeverityCounts = Record<Severity, number>;

export interface ScanResult {
  findings: RawFinding[];
  filesScanned: number;
  bytesScanned: number;
  skippedFiles: number;
  truncated: boolean;
  durationMs: number;
  engineVersion: string;
  score: number;
  grade: string;
  counts: SeverityCounts;
  warnings: string[];
  detectedStack?: string;
}

export interface ScanLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxFileBytes: number;
  maxFindings: number;
}

export const DEFAULT_SCAN_LIMITS: ScanLimits = {
  maxFiles: 2500,
  maxTotalBytes: 30 * 1024 * 1024,
  maxFileBytes: 1024 * 1024,
  maxFindings: 500,
};

export const ENGINE_VERSION = "vibecheck-engine/0.2.0";

export function lineAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

export function lineTextAt(lines: string[], line: number): string {
  return (lines[line - 1] ?? "").trim();
}

export function snippetAround(
  lines: string[],
  start: number,
  end: number,
  padding = 1,
): string {
  const from = Math.max(0, start - 1 - padding);
  const to = Math.min(lines.length, end + padding);
  return lines.slice(from, to).join("\n").slice(0, 1600);
}
