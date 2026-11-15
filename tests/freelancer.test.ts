import { afterEach, describe, expect, it, vi } from "vitest";
import { canFinalizeReport } from "../src/lib/review";
import { buildSelfServiceSummary } from "../src/lib/report";

afterEach(() => vi.unstubAllEnvs());

describe("freelancer self-service workflow", () => {
  it("defaults to the freelancer workflow and does not require analyst sign-off", () => {
    vi.stubEnv("SOLO_MODE", "");

    expect(
      canFinalizeReport({
        findings: [{ analystStatus: "OPEN" }],
        reviewCompletedAt: null,
        reportStatus: "DRAFT",
        hasScan: true,
      }),
    ).toEqual({ ok: true, reasons: [] });
  });

  it("explains that generated findings are automated candidates", () => {
    const summary = buildSelfServiceSummary({
      engagement: { name: "Freelancer app", tier: "QUICK_SCAN" },
      organizationName: "Jordan's workspace",
      findings: [
        {
          title: "Possible unsafe query",
          analystTitle: null,
          description: "User input reaches a database query.",
          analystDescription: null,
          severity: "HIGH",
          confidence: 86,
          filePath: "src/db.ts",
          lineStart: 18,
          analystStatus: "OPEN",
        },
      ],
      filesScanned: 24,
      finishedAt: new Date("2026-01-01T00:00:00.000Z"),
      score: 18,
      grade: "B",
    });

    expect(summary).toContain("1 potential finding");
    expect(summary).toContain("have not been validated by a human security analyst");
    expect(summary).toContain("src/db.ts:18");
  });
});
