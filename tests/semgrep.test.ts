import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  mergeSemgrepFindings,
  normalizeSemgrepResults,
  scanWithSemgrep,
} from "../src/lib/scan/semgrep";
import type { FileContext, RawFinding } from "../src/lib/scan/types";

const root = "/tmp/vibecheck-semgrep-test/source";
const HAS_PINNED_SEMGREP = (() => {
  try {
    return execFileSync("semgrep", ["--version"], { encoding: "utf8" })
      .trim()
      .endsWith("1.185.0");
  } catch {
    return false;
  }
})();

function source(path: string, content: string): FileContext {
  return {
    path,
    content,
    lines: content.split("\n"),
    ext: path.slice(path.lastIndexOf(".")),
  };
}

function result(
  path: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    check_id: "vibecheck.js.sql-injection",
    path,
    start: { line: 2 },
    end: { line: 2 },
    extra: {
      message: "Request-controlled data reaches a database query.",
      severity: "ERROR",
      metadata: {
        category: "Injection",
        confidence: 0.86,
        cwe: "CWE-89",
        owasp: "A05:2025",
        remediation: "Use a parameterized query.",
      },
    },
    ...overrides,
  };
}

describe("Semgrep result normalization", () => {
  it("normalizes authored rule metadata into a redacted VibeCheck finding", () => {
    const file = source(
      "src/users.ts",
      'const query = "safe";\ndb.query(req.query.id);',
    );
    const normalized = normalizeSemgrepResults(root, [file], [
      result(`${root}/src/users.ts`),
    ]);

    expect(normalized.skipped).toBe(0);
    expect(normalized.findings).toHaveLength(1);
    expect(normalized.findings[0]).toMatchObject({
      ruleId: "vibecheck.js.sql-injection",
      source: "CUSTOM",
      severity: "HIGH",
      cwe: ["CWE-89"],
      owasp: "A05",
      filePath: "src/users.ts",
      lineStart: 2,
      confidence: 86,
    });
  });

  it("omits results that lack valid taxonomy metadata or an in-scope source file", () => {
    const file = source("src/users.ts", "db.query(input);");
    const missingMetadata = result(`${root}/src/users.ts`, {
      extra: {
        message: "Finding",
        severity: "WARNING",
        metadata: { cwe: "not-a-cwe", owasp: "A99" },
      },
    });
    const outsideRepository = result("/etc/passwd");
    const normalized = normalizeSemgrepResults(root, [file], [
      missingMetadata,
      outsideRepository,
    ]);

    expect(normalized.findings).toEqual([]);
    expect(normalized.skipped).toBe(2);
  });

  it("uses 2025 OWASP metadata without relabeling 2021-only findings", () => {
    const file = source("src/users.ts", "db.query(input);");
    const results = normalizeSemgrepResults(root, [file], [
      result("src/users.ts", {
        check_id: "tmp.vibecheck.js.sql-injection",
        extra: {
          message: "Finding",
          severity: "ERROR",
          metadata: {
            cwe: "CWE-89",
            owasp: ["A10:2021 - SSRF", "A01:2025 - Broken Access Control"],
          },
        },
      }),
      result("src/users.ts", {
        extra: {
          message: "Legacy-only mapping",
          severity: "WARNING",
          metadata: { cwe: "CWE-89", owasp: "A10:2021 - SSRF" },
        },
      }),
    ]);

    expect(results.findings.map(({ ruleId, owasp }) => ({ ruleId, owasp }))).toEqual([
      { ruleId: "vibecheck.js.sql-injection", owasp: "A01" },
      { ruleId: "vibecheck.js.sql-injection", owasp: "N/A" },
    ]);
    expect(results.unmappedOwasp).toBe(1);
  });

  it("rejects malformed result collections", () => {
    expect(() => normalizeSemgrepResults(root, [], null)).toThrow(
      "did not contain a results array",
    );
  });
});

describe("Semgrep finding merge", () => {
  it("reports an unavailable Semgrep executable as a scanner warning", async () => {
    const scan = await scanWithSemgrep(
      [source("src/users.ts", "db.query(input);")],
      "/vibecheck-test-missing-semgrep",
    );

    expect(scan.findings).toEqual([]);
    expect(scan.warnings[0]).toContain("Semgrep scan failed");
  });

  it("deduplicates equivalent CWE findings at the same file and line", () => {
    const existing = {
      ruleId: "AI-SQL-001",
      source: "CUSTOM",
      title: "SQL injection",
      severity: "HIGH",
      cwe: ["CWE-89"],
      owasp: "A05",
      category: "Injection",
      filePath: "src/users.ts",
      lineStart: 2,
      lineEnd: 2,
      snippet: "",
      description: "",
      remediation: "",
      confidence: 80,
      fingerprint: "native",
    } satisfies RawFinding;
    const semgrep = {
      ...existing,
      ruleId: "vibecheck.js.sql-injection",
      fingerprint: "semgrep",
    };

    expect(mergeSemgrepFindings([existing], [semgrep])).toEqual([existing]);
    expect(mergeSemgrepFindings([], [semgrep, semgrep])).toEqual([semgrep]);
  });
});

describe.skipIf(!HAS_PINNED_SEMGREP)("Authored GitHub Actions rules", () => {
  it("flags untrusted event interpolation and remote installers, not trusted refs", async () => {
    const files = [
      source(
        ".github/workflows/trusted.yml",
        [
          "name: trusted",
          "on:",
          "  push:",
          "    branches: [main]",
          "jobs:",
          "  build:",
          "    steps:",
          "      - run: echo ${{ github.ref_name }}",
        ].join("\n"),
      ),
      source(
        ".github/workflows/untrusted.yml",
        [
          "name: untrusted",
          "on: pull_request_target",
          "jobs:",
          "  build:",
          "    steps:",
          "      - run: |",
          "          echo ${{ github.event.pull_request.title }}",
        ].join("\n"),
      ),
      source(
        ".github/workflows/install.yml",
        [
          "jobs:",
          "  build:",
          "    steps:",
          "      - run: |",
          "          curl -fsSL https://example.test/install.sh | sh",
        ].join("\n"),
      ),
    ];

    const result = await scanWithSemgrep(files);

    expect(result.warnings).toEqual([]);
    expect(
      result.findings.map(({ ruleId, filePath, lineStart, severity, cwe }) => ({
        ruleId,
        filePath,
        lineStart,
        severity,
        cwe,
      })),
    ).toEqual([
      {
        ruleId: "vibecheck.github-actions.remote-shell-installer",
        filePath: ".github/workflows/install.yml",
        lineStart: 4,
        severity: "MEDIUM",
        cwe: ["CWE-494"],
      },
      {
        ruleId: "vibecheck.github-actions.untrusted-event-shell",
        filePath: ".github/workflows/untrusted.yml",
        lineStart: 6,
        severity: "HIGH",
        cwe: ["CWE-78"],
      },
    ]);
  });
});
