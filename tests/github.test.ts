import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  blockingCiFindings,
  shouldFailGitHubCheck,
} from "../src/lib/github-ci";
import { verifyGitHubWebhook } from "../src/lib/github-app";
import { githubRepositoryKey } from "../src/lib/ingest";

afterEach(() => vi.unstubAllEnvs());

describe("GitHub webhook signatures", () => {
  it("normalizes only safe GitHub repository URLs for event matching", () => {
    expect(githubRepositoryKey("https://github.com/Owner/Repo.git")).toBe(
      "owner/repo",
    );
    expect(githubRepositoryKey("https://gitlab.com/owner/repo")).toBeNull();
    expect(githubRepositoryKey("https://user:pass@github.com/owner/repo")).toBeNull();
  });

  it("accepts a valid SHA-256 signature for the exact body", () => {
    const body = '{"action":"push"}';
    const secret = "webhook-test-secret";
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", secret);
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(verifyGitHubWebhook(body, signature)).toBe(true);
    expect(verifyGitHubWebhook(`${body} `, signature)).toBe(false);
  });

  it("rejects malformed or missing signatures and requires configuration", () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "webhook-test-secret");
    expect(verifyGitHubWebhook("{}", null)).toBe(false);
    expect(verifyGitHubWebhook("{}", "sha1=deadbeef")).toBe(false);
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
    expect(() => verifyGitHubWebhook("{}", "sha256=deadbeef")).toThrow(
      "GitHub webhook secret is not configured",
    );
  });
});

describe("per-project CI finding policy", () => {
  const findings = [
    { severity: "CRITICAL" as const },
    { severity: "HIGH" as const },
    { severity: "MEDIUM" as const },
  ];

  it("supports report-only, critical/high, and any-finding policies", () => {
    expect(blockingCiFindings("REPORT_ONLY", findings)).toEqual([]);
    expect(blockingCiFindings("BLOCK_HIGH", findings)).toEqual(findings.slice(0, 2));
    expect(blockingCiFindings("BLOCK_ANY", findings)).toEqual(findings);
    expect(shouldFailGitHubCheck("REPORT_ONLY", findings, true)).toBe(false);
    expect(shouldFailGitHubCheck("BLOCK_HIGH", findings.slice(2))).toBe(false);
    expect(shouldFailGitHubCheck("BLOCK_HIGH", findings.slice(2), true)).toBe(true);
    expect(shouldFailGitHubCheck("BLOCK_ANY", findings.slice(2))).toBe(true);
  });
});
