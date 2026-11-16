import { describe, expect, it } from "vitest";
import { scanDirectory, scanFiles } from "../src/lib/scan/engine";
import { customRules } from "../src/lib/scan/rules";
import { secretRules } from "../src/lib/scan/secrets";
import { computeRisk } from "../src/lib/scan/score";
import { classifyPath, tuneHeuristicFinding } from "../src/lib/scan/paths";
import {
  DEFAULT_SCAN_LIMITS,
  type FileContext,
} from "../src/lib/scan/types";

// The benchmark fixtures are fixed on disk, so they are scanned without the
// live advisory feed: the offline advisory set covers every fixture dependency.
const OFFLINE = { offline: true };

const EXPECTED_RULES = [
  ...customRules.map((rule) => rule.id),
  ...secretRules.map((rule) => rule.id),
  "SCA-VULN-001",
  "SCA-LICENSE-001",
];

const RAW_SECRETS = [
  "AKIAIOSFODNN7EXAMPLE",
  "sk_test_51H8xYzabc1234567890abc",
  "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
  "supersecret",
  "local-dev-jwt-secret-please-change",
  "python-dev-secret-key",
  "dev-secret-123",
  "super-secret-key",
  "SG.abcdefghijklmnop",
  "MIIEowIBAAKCAQEAuExample",
];

function context(content: string, filePath = "src/users.js"): FileContext {
  return {
    path: filePath,
    content,
    lines: content.split("\n"),
    ext: filePath.slice(filePath.lastIndexOf(".")),
  };
}

describe("scanner benchmark", () => {
  it("covers every named rule against the seeded vulnerable repository", async () => {
    const result = await scanDirectory("benchmarks/vulnerable-app", undefined, OFFLINE);
    const seen = new Set(result.findings.map((finding) => finding.ruleId));
    const missing = EXPECTED_RULES.filter((ruleId) => !seen.has(ruleId));
    expect(missing).toEqual([]);
    expect(result.findings.length).toBeGreaterThanOrEqual(EXPECTED_RULES.length);
    expect(result.score).toBeGreaterThan(60);
    expect(
      result.findings.find((finding) => finding.ruleId === "SCA-VULN-001")?.owasp,
    ).toBe("A03");
    expect(
      result.findings.find((finding) => finding.ruleId === "SCA-LICENSE-001")?.owasp,
    ).toBe("N/A");
  });

  it("produces no false positives on the hardened repository", async () => {
    const result = await scanDirectory("benchmarks/clean-app", undefined, OFFLINE);
    expect(
      result.findings.map(
        (finding) => `${finding.ruleId} ${finding.filePath}:${finding.lineStart}`,
      ),
    ).toEqual([]);
    expect(result.score).toBe(0);
    expect(result.grade).toBe("A");
  });

  it("reports when the finding limit truncates a scan", async () => {
    const result = await scanDirectory(
      "benchmarks/vulnerable-app",
      { ...DEFAULT_SCAN_LIMITS, maxFindings: 1 },
      OFFLINE,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.truncated).toBe(true);
  });

  it("never persists raw secret values in findings", async () => {
    const result = await scanDirectory("benchmarks/vulnerable-app", undefined, OFFLINE);
    const secretFindings = result.findings.filter(
      (finding) => finding.source === "SECRET",
    );
    expect(secretFindings.length).toBeGreaterThan(0);
    for (const finding of secretFindings) {
      for (const secret of RAW_SECRETS) {
        expect(finding.snippet).not.toContain(secret);
        expect(finding.description).not.toContain(secret);
      }
    }
  });

  it("keeps fingerprints stable when unrelated lines shift", () => {
    const line =
      'const rows = await db.query("SELECT * FROM users WHERE id = " + req.params.id);';
    const first = scanFiles([context(line)]).find(
      (finding) => finding.ruleId === "AI-SQL-001",
    );
    const second = scanFiles([context(`\n\n\n\n${line}`)]).find(
      (finding) => finding.ruleId === "AI-SQL-001",
    );
    expect(first?.fingerprint).toBeDefined();
    expect(second?.fingerprint).toBe(first?.fingerprint);
  });

  it("deduplicates repeated in-memory findings and keeps the strongest match", () => {
    const secret = 'const apiKey = "sk_live_51H8xYzabc1234567890abc";';
    const result = scanFiles([
      context(secret, "src/server.js"),
      context(secret, "src/server.js"),
    ]);

    expect(
      result.filter((finding) => finding.ruleId === "SEC-STRIPE-001"),
    ).toHaveLength(1);
    expect(
      result.filter((finding) => finding.ruleId === "SEC-GENERIC-001"),
    ).toHaveLength(1);
    expect(result[0]?.severity).toBe("CRITICAL");
  });

  it("scores critical findings above a single high finding", () => {
    const critical = computeRisk([
      { severity: "CRITICAL", confidence: 90 },
    ]);
    const high = computeRisk([{ severity: "HIGH", confidence: 90 }]);
    expect(critical.score).toBeGreaterThan(high.score);
    expect(computeRisk([])).toMatchObject({ score: 0, grade: "A" });
  });

  it("flags known vulnerable versions and license obligations", async () => {
    const result = await scanDirectory("benchmarks/vulnerable-app", undefined, OFFLINE);
    const sca = result.findings.filter((finding) => finding.source === "SCA");
    expect(sca.some((finding) => finding.title.includes("CVE-2025-29927"))).toBe(
      true,
    );
    expect(
      result.findings.some(
        (finding) =>
          finding.ruleId === "SCA-LICENSE-001" &&
          finding.title.includes("GPL-3.0"),
      ),
    ).toBe(true);
  });
});

describe("path precision", () => {
  it("classifies the paths that account for most scanner noise", () => {
    expect(classifyPath("src/server.js")).toBe("production");
    expect(classifyPath("server.js")).toBe("production");
    expect(classifyPath("examples/auth.js")).toBe("example");
    expect(classifyPath("test/users.spec.ts")).toBe("test");
    expect(classifyPath("src/routes/__tests__/admin.js")).toBe("test");
    expect(classifyPath("docs/security.md")).toBe("docs");
    expect(classifyPath("README.md")).toBe("docs");
    expect(classifyPath("vendor/acme-widget/index.js")).toBe("vendor");
    expect(classifyPath("third_party/lib.js")).toBe("vendor");
    expect(classifyPath("src/generated/api.ts")).toBe("generated");
    expect(classifyPath("app.min.js")).toBe("generated");
    expect(classifyPath("benchmarks/vulnerable-app/server.js")).toBe("test");
  });

  it("caps severity and confidence outside application code", () => {
    const production = tuneHeuristicFinding({
      severity: "HIGH",
      confidence: 88,
      filePath: "src/routes/users.js",
    });
    expect(production).toMatchObject({ severity: "HIGH", confidence: 88, demoted: false });

    const example = tuneHeuristicFinding({
      severity: "HIGH",
      confidence: 88,
      filePath: "examples/routes/users.js",
    });
    expect(example.severity).toBe("MEDIUM");
    expect(example.confidence).toBeLessThan(50);
    expect(example.demoted).toBe(true);

    const docs = tuneHeuristicFinding({
      severity: "CRITICAL",
      confidence: 90,
      filePath: "docs/recipes/auth.md",
    });
    expect(docs.severity).toBe("LOW");
  });

  it("demotes heuristic findings in examples but keeps secrets at full strength", () => {
    const body = [
      "const express = require('express');",
      "const app = express();",
      "app.post('/api/admin/users', async (req, res) => { res.json({ ok: true }); });",
      "const stripeKey = 'sk_live_51H8xYzabc1234567890abc';",
    ].join("\n");
    const exampleFindings = scanFiles([context(body, "examples/server.js")]);
    const productionFindings = scanFiles([context(body, "src/server.js")]);

    const authInExample = exampleFindings.find(
      (finding) => finding.ruleId === "AI-AUTH-001",
    );
    const authInProduction = productionFindings.find(
      (finding) => finding.ruleId === "AI-AUTH-001",
    );
    expect(authInExample?.severity).toBe("MEDIUM");
    expect(authInExample?.confidence).toBeLessThan(
      authInProduction?.confidence ?? 0,
    );
    expect(authInProduction?.severity).toBe("HIGH");

    const secretExample = exampleFindings.find(
      (finding) => finding.ruleId === "SEC-STRIPE-001",
    );
    expect(secretExample?.severity).toBe("CRITICAL");
    expect(secretExample?.confidence).toBe(98);
  });

  it("weights low-confidence findings below confirmed ones", () => {
    const guess = computeRisk([{ severity: "HIGH", confidence: 30 }]);
    const confirmed = computeRisk([{ severity: "HIGH", confidence: 95 }]);
    expect(guess.score).toBeLessThan(confirmed.score);
  });
});
