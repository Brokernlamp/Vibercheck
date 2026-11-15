import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canFinalizeReport, getReviewState } from "../src/lib/review";

const signedOff = new Date("2026-01-01T00:00:00Z");

beforeEach(() => vi.stubEnv("SOLO_MODE", "0"));
afterEach(() => vi.unstubAllEnvs());

describe("review gate", () => {
  it("blocks finalization while any finding is untriaged", () => {
    const result = canFinalizeReport({
      findings: [
        { analystStatus: "CONFIRMED" },
        { analystStatus: "OPEN" },
      ],
      reviewCompletedAt: signedOff,
      reportStatus: "DRAFT",
      hasScan: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toContain("still need an analyst decision");
  });

  it("blocks finalization without the explicit analyst sign-off", () => {
    const result = canFinalizeReport({
      findings: [{ analystStatus: "CONFIRMED" }],
      reviewCompletedAt: null,
      reportStatus: "DRAFT",
      hasScan: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("Analyst review has not been completed.");
  });

  it("blocks finalization with no successful scan or no draft report", () => {
    const result = canFinalizeReport({
      findings: [],
      reviewCompletedAt: signedOff,
      reportStatus: null,
      hasScan: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "The engagement has no completed scan.",
    );
    expect(result.reasons).toContain("There is no draft report to finalize.");
  });

  it("passes only when triage, sign-off, scan, and draft all exist", () => {
    const result = canFinalizeReport({
      findings: [
        { analystStatus: "CONFIRMED" },
        { analystStatus: "DISMISSED" },
      ],
      reviewCompletedAt: signedOff,
      reportStatus: "DRAFT",
      hasScan: true,
    });
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("calculates triage progress consistently", () => {
    expect(
      getReviewState([
        { analystStatus: "CONFIRMED" },
        { analystStatus: "DISMISSED" },
        { analystStatus: "OPEN" },
        { analystStatus: "OPEN" },
      ]),
    ).toMatchObject({
      total: 4,
      open: 2,
      confirmed: 1,
      dismissed: 1,
      percent: 50,
      triageComplete: false,
    });
    expect(getReviewState([])).toMatchObject({
      total: 0,
      percent: 100,
      triageComplete: true,
    });
  });
});
