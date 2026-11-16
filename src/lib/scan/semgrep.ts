import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fingerprintFor } from "./fingerprint";
import { redactSnippetText } from "./redact";
import {
  lineTextAt,
  snippetAround,
  type FileContext,
  type RawFinding,
} from "./types";

const execFileAsync = promisify(execFile);
const EXPECTED_SEMGREP_VERSION = "1.185.0";
export const SEMGREP_RULESET_VERSION = "vibecheck-semgrep/1.0.0";
const PROCESS_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_FINDINGS = 2_000;

export const SEMGREP_RULES = `rules:
  - id: vibecheck.js.sql-injection
    mode: taint
    languages: [javascript, typescript]
    severity: ERROR
    message: Request-controlled data reaches a database query.
    metadata:
      category: Injection
      confidence: 86
      cwe: CWE-89
      owasp: A05:2025
      remediation: Use a parameterized query and pass untrusted values separately from SQL text.
    pattern-sources:
      - pattern-either:
          - pattern: $REQ.query.$FIELD
          - pattern: $REQ.body.$FIELD
          - pattern: $REQ.params.$FIELD
    pattern-sinks:
      - patterns:
        - pattern-either:
          - pattern: $DB.query($SQL, ...)
          - pattern: $DB.execute($SQL, ...)
        - focus-metavariable: $SQL

  - id: vibecheck.js.command-injection
    mode: taint
    languages: [javascript, typescript]
    severity: ERROR
    message: Request-controlled data reaches a shell command.
    metadata:
      category: Command injection
      confidence: 86
      cwe: CWE-78
      owasp: A05:2025
      remediation: Avoid shell command construction; use a fixed executable and validated argument array with shell disabled.
    pattern-sources:
      - pattern-either:
          - pattern: $REQ.query.$FIELD
          - pattern: $REQ.body.$FIELD
          - pattern: $REQ.params.$FIELD
    pattern-sinks:
      - patterns:
        - pattern-either:
          - pattern: child_process.exec($CMD, ...)
          - pattern: exec($CMD, ...)
        - focus-metavariable: $CMD

  - id: vibecheck.py.sql-injection
    mode: taint
    languages: [python]
    severity: ERROR
    message: Request-controlled data reaches a database query.
    metadata:
      category: Injection
      confidence: 86
      cwe: CWE-89
      owasp: A05:2025
      remediation: Use a parameterized query and pass untrusted values separately from SQL text.
    pattern-sources:
      - pattern-either:
          - pattern: request.args.get(...)
          - pattern: request.form.get(...)
          - pattern: request.json[...]
          - pattern: request.GET.get(...)
          - pattern: request.POST.get(...)
    pattern-sinks:
      - patterns:
          - pattern: $CURSOR.execute($SQL, ...)
          - focus-metavariable: $SQL

  - id: vibecheck.py.command-injection
    mode: taint
    languages: [python]
    severity: ERROR
    message: Request-controlled data reaches a shell command.
    metadata:
      category: Command injection
      confidence: 86
      cwe: CWE-78
      owasp: A05:2025
      remediation: Avoid shell command construction; use a fixed executable and validated argument array with shell disabled.
    pattern-sources:
      - pattern-either:
          - pattern: request.args.get(...)
          - pattern: request.form.get(...)
          - pattern: request.json[...]
          - pattern: request.GET.get(...)
          - pattern: request.POST.get(...)
    pattern-sinks:
      - patterns:
          - pattern-either:
              - pattern: subprocess.run($CMD, ..., shell=True, ...)
              - pattern: subprocess.Popen($CMD, ..., shell=True, ...)
              - pattern: os.system($CMD)
          - focus-metavariable: $CMD
`;

interface SemgrepMetadata {
  category?: unknown;
  confidence?: unknown;
  cwe?: unknown;
  owasp?: unknown;
  remediation?: unknown;
  title?: unknown;
}

interface SemgrepResult {
  check_id?: unknown;
  path?: unknown;
  start?: { line?: unknown };
  end?: { line?: unknown };
  extra?: {
    message?: unknown;
    severity?: unknown;
    metadata?: SemgrepMetadata;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cweIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return [
    ...new Set(
      values.flatMap((item) =>
        typeof item === "string"
          ? item.match(/\bCWE-\d+\b/gi)?.map((id) => id.toUpperCase()) ?? []
          : [],
      ),
    ),
  ];
}

function owaspId(value: unknown): string | null {
  const values = Array.isArray(value) ? value : [value];
  let unversionedCategory: string | null = null;
  for (const item of values) {
    if (typeof item !== "string") continue;
    const match = /\b(A(?:0[1-9]|10))(?:\s*:\s*(\d{4}))?\b/i.exec(item);
    if (!match) continue;
    const category = match[1]!.toUpperCase();
    if (match[2] === "2025") return category;
    if (match[2] === undefined) unversionedCategory ??= category;
  }
  return unversionedCategory;
}

function stableRuleId(value: unknown): string {
  if (typeof value !== "string") return "semgrep.unknown-rule";
  const marker = "vibecheck.";
  const markerIndex = value.lastIndexOf(marker);
  return markerIndex >= 0 ? value.slice(markerIndex) : value;
}

function severity(value: unknown): RawFinding["severity"] {
  switch (typeof value === "string" ? value.toUpperCase() : "") {
    case "CRITICAL":
      return "CRITICAL";
    case "ERROR":
    case "HIGH":
      return "HIGH";
    case "WARNING":
    case "MEDIUM":
      return "MEDIUM";
    case "LOW":
      return "LOW";
    default:
      return "INFO";
  }
}

function confidence(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const percent = value <= 1 ? value * 100 : value;
    return Math.round(Math.max(0, Math.min(100, percent)));
  }
  if (typeof value === "string") {
    const normalized = value.toUpperCase();
    if (normalized === "HIGH") return 90;
    if (normalized === "MEDIUM") return 70;
    if (normalized === "LOW") return 45;
  }
  return 75;
}

function lineNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function semgrepEnvironment(): NodeJS.ProcessEnv {
  const keys = [
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "SYSTEMROOT",
    "USERPROFILE",
  ];
  return {
    ...Object.fromEntries(
      keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    ),
    NODE_ENV: process.env.NODE_ENV ?? "production",
    SEMGREP_SEND_METRICS: "off",
  };
}

function relativePath(root: string, value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const resolved = path.resolve(root, value);
  const rel = path.relative(root, resolved);
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return null;
  }
  return rel.split(path.sep).join("/");
}

export function normalizeSemgrepResults(
  root: string,
  files: FileContext[],
  results: unknown,
): { findings: RawFinding[]; skipped: number; unmappedOwasp: number } {
  if (!Array.isArray(results)) {
    throw new Error("Semgrep JSON output did not contain a results array");
  }

  const filesByPath = new Map(files.map((file) => [file.path, file]));
  const findings: RawFinding[] = [];
  let skipped = 0;
  let unmappedOwasp = 0;

  for (const value of results) {
    if (!isRecord(value)) {
      skipped += 1;
      continue;
    }
    const result = value as SemgrepResult;
    const filePath = relativePath(root, result.path);
    const file = filePath ? filesByPath.get(filePath) : undefined;
    const metadata = result.extra?.metadata ?? {};
    const ruleId = stableRuleId(result.check_id);
    const cwe = cweIds(metadata.cwe);
    const mappedOwasp = owaspId(metadata.owasp);
    if (!filePath || !file || cwe.length === 0) {
      skipped += 1;
      continue;
    }
    if (!mappedOwasp) unmappedOwasp += 1;

    const lineStart = lineNumber(result.start?.line, 1);
    const lineEnd = Math.max(lineStart, lineNumber(result.end?.line, lineStart));
    const evidence = lineTextAt(file.lines, lineStart) || ruleId;
    const message =
      typeof result.extra?.message === "string"
        ? result.extra.message
        : ruleId;
    const title =
      typeof metadata.title === "string" ? metadata.title : message.split(/[.\n]/)[0]!;
    const remediation =
      typeof metadata.remediation === "string"
        ? metadata.remediation
        : "Review the matched data flow and apply a context-appropriate security fix.";

    findings.push({
      ruleId,
      source: "CUSTOM",
      title: redactSnippetText(title),
      severity: severity(result.extra?.severity),
      cwe,
      owasp: mappedOwasp ?? "N/A",
      category:
        typeof metadata.category === "string"
          ? redactSnippetText(metadata.category)
          : "Static analysis",
      filePath,
      lineStart,
      lineEnd,
      snippet: redactSnippetText(snippetAround(file.lines, lineStart, lineEnd)),
      description: redactSnippetText(message),
      remediation: redactSnippetText(remediation),
      confidence: confidence(metadata.confidence),
      fingerprint: fingerprintFor(ruleId, filePath, evidence),
    });
  }

  return { findings, skipped, unmappedOwasp };
}

export function mergeSemgrepFindings(
  existing: RawFinding[],
  semgrep: RawFinding[],
): RawFinding[] {
  const merged = [...existing];
  const cwesByLocation = new Map<string, Set<string>>();

  for (const finding of existing) {
    const key = `${finding.filePath}\0${finding.lineStart}`;
    const cwes = cwesByLocation.get(key) ?? new Set<string>();
    finding.cwe.forEach((cwe) => cwes.add(cwe));
    cwesByLocation.set(key, cwes);
  }

  for (const candidate of semgrep) {
    const key = `${candidate.filePath}\0${candidate.lineStart}`;
    const existingCwes = cwesByLocation.get(key) ?? new Set<string>();
    if (candidate.cwe.some((cwe) => existingCwes.has(cwe))) continue;
    merged.push(candidate);
    candidate.cwe.forEach((cwe) => existingCwes.add(cwe));
    cwesByLocation.set(key, existingCwes);
  }

  return merged;
}

export interface SemgrepScanResult {
  findings: RawFinding[];
  warnings: string[];
  engineVersion: string | null;
}

export async function scanWithSemgrep(
  files: FileContext[],
  binary = process.env.SEMGREP_BIN?.trim() || "semgrep",
): Promise<SemgrepScanResult> {
  const warnings: string[] = [];
  let root: string | undefined;

  try {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "vibecheck-semgrep-"));
    const configPath = path.join(root, "vibecheck-rules.yml");
    const sourcePath = path.join(root, "source");
    await fs.mkdir(sourcePath, { recursive: true, mode: 0o700 });
    for (const file of files) {
      const target = path.resolve(sourcePath, ...file.path.split("/"));
      const relative = path.relative(sourcePath, target);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error(`Invalid repository path for Semgrep: ${file.path}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, file.content, { encoding: "utf8", mode: 0o600 });
    }
    await fs.writeFile(configPath, SEMGREP_RULES, { encoding: "utf8", mode: 0o600 });

    const versionResult = await execFileAsync(binary, ["--version"], {
      cwd: root,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: semgrepEnvironment(),
    });
    const actualVersion = versionResult.stdout.trim().match(/\b\d+\.\d+\.\d+\b/)?.[0];
    if (actualVersion !== EXPECTED_SEMGREP_VERSION) {
      warnings.push(
        `Semgrep version mismatch: expected ${EXPECTED_SEMGREP_VERSION}, found ${actualVersion ?? "unknown"}; Semgrep checks were not run.`,
      );
      return { findings: [], warnings, engineVersion: null };
    }

    const scanResult = await execFileAsync(
      binary,
      [
        "scan",
        "--config",
        configPath,
        "--json",
        "--metrics=off",
        "--disable-version-check",
        "--no-git-ignore",
        "--timeout",
        "20",
        ".",
      ],
      {
        cwd: sourcePath,
        timeout: PROCESS_TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
        env: semgrepEnvironment(),
      },
    );
    let payload: unknown;
    try {
      payload = JSON.parse(scanResult.stdout);
    } catch {
      throw new Error("Semgrep returned invalid JSON output");
    }
    if (!isRecord(payload)) throw new Error("Semgrep returned an invalid result object");

    const normalized = normalizeSemgrepResults(
      path.join(root, "source"),
      files,
      payload.results,
    );
    if (normalized.skipped > 0) {
      warnings.push(
        `${normalized.skipped} Semgrep result(s) were omitted because CWE metadata or a source path was missing.`,
      );
    }
    if (normalized.unmappedOwasp > 0) {
      warnings.push(
        `${normalized.unmappedOwasp} Semgrep finding(s) had no OWASP Top 10:2025 mapping and are labeled N/A.`,
      );
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      warnings.push(`Semgrep reported ${payload.errors.length} analysis error(s).`);
    }
    return {
      findings: normalized.findings.slice(0, MAX_FINDINGS),
      warnings,
      engineVersion: actualVersion,
    };
  } catch (error) {
    const rawCode = isRecord(error) ? error.code : null;
    const code =
      typeof rawCode === "string" || typeof rawCode === "number"
        ? String(rawCode)
        : null;
    const reason =
      code === "ENOENT"
        ? "the configured executable is unavailable"
        : code === "ETIMEDOUT"
          ? "the process timed out"
          : code
            ? `process or workspace error (${code})`
            : "invalid output or an unexpected process error";
    warnings.push(`Semgrep scan failed: ${reason}.`);
    return { findings: [], warnings, engineVersion: null };
  } finally {
    if (root) {
      try {
        await fs.rm(root, { recursive: true, force: true });
      } catch {
        warnings.push("Semgrep temporary source workspace cleanup failed.");
      }
    }
  }
}
