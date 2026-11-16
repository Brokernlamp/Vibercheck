import { describe, expect, it } from "vitest";
import {
  OWASP_CATEGORIES,
  OWASP_CATEGORIES_2021,
  OWASP_TAXONOMY_LABEL,
} from "../src/lib/domain";
import { customRules } from "../src/lib/scan/rules";
import { secretRules } from "../src/lib/scan/secrets";
import { cweForRule, hasCweMapping } from "../src/lib/scan/cwe";

describe("OWASP taxonomy labels", () => {
  it("uses the exact OWASP Top 10:2025 category names", () => {
    expect(OWASP_TAXONOMY_LABEL).toBe("OWASP Top 10:2025");
    expect(OWASP_CATEGORIES).toMatchObject({
      A01: "Broken Access Control",
      A02: "Security Misconfiguration",
      A03: "Software Supply Chain Failures",
      A04: "Cryptographic Failures",
      A05: "Injection",
      A06: "Insecure Design",
      A07: "Authentication Failures",
      A08: "Software or Data Integrity Failures",
      A09: "Security Logging and Alerting Failures",
      A10: "Mishandling of Exceptional Conditions",
    });
  });

  it("keeps the previous taxonomy available for previously issued reports", () => {
    expect(OWASP_CATEGORIES_2021.A03).toBe("Injection");
    expect(OWASP_CATEGORIES_2021.A06).toBe("Vulnerable & Outdated Components");
    expect(OWASP_CATEGORIES_2021.A10).toBe("Server-Side Request Forgery");
  });

  it("maps every built-in code and secret rule to a known 2025 category", () => {
    for (const rule of [...customRules, ...secretRules]) {
      expect(
        OWASP_CATEGORIES[rule.owasp],
        `${rule.id} should use a valid OWASP Top 10:2025 category`,
      ).toBeDefined();
      expect(hasCweMapping(rule.id), `${rule.id} should have a CWE mapping`).toBe(true);
      expect(cweForRule(rule.id).every((cwe) => /^CWE-\d+$/.test(cwe))).toBe(true);
    }
  });

  it("maps debug and JWT findings to their distinct weakness types", () => {
    expect(cweForRule("AI-DEBUG-001")).toContain("CWE-489");
    expect(cweForRule("AI-JWT-001")).toContain("CWE-798");
  });
});
