import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashToken } from "../src/lib/crypto";
import { billingMode, scanExecution } from "../src/lib/env";
import {
  consumeRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  totpCode,
  verifyTotp,
} from "../src/lib/mfa";
import { checkPassword } from "../src/lib/password-policy";

describe("two-factor authentication", () => {
  it("matches the RFC 6238 SHA-1 vector for a six-digit code", () => {
    // Secret "12345678901234567890"; at T=59 the 8-digit vector is 94287082.
    expect(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });

  it("accepts the current step and one step of clock skew, not stale codes", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), 1, now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), 1, now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), 1, now)).toBe(false);
    expect(verifyTotp(secret, "000000", 1, now)).toBe(false);
    expect(verifyTotp(secret, "not-a-code", 1, now)).toBe(false);
  });

  it("generates distinct base32 secrets", () => {
    const first = generateTotpSecret();
    const second = generateTotpSecret();
    expect(first).toMatch(/^[A-Z2-7]+$/);
    expect(first).not.toBe(second);
  });

  it("stores MFA secrets encrypted and rejects tampering", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe(secret);

    const parts = encrypted.split(":");
    const tampered = [parts[0], parts[1], parts[2], `${parts[3]}x`].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("consumes a recovery code exactly once", () => {
    const codes = generateRecoveryCodes(2);
    const first = consumeRecoveryCode(codes.plain[0], codes.hashes);
    expect(first.valid).toBe(true);
    expect(first.remaining).toHaveLength(1);

    const replay = consumeRecoveryCode(codes.plain[0], first.remaining);
    expect(replay.valid).toBe(false);

    const hyphenless = codes.plain[1].replace("-", "").toLowerCase();
    expect(consumeRecoveryCode(hyphenless, first.remaining).valid).toBe(true);
    expect(hashToken("same")).toBe(hashToken("same"));
  });
});

describe("password policy", () => {
  it("requires length, a letter, and a number", () => {
    expect(checkPassword("short1").ok).toBe(false);
    expect(checkPassword("allletterslongenough").ok).toBe(false);
    expect(checkPassword("1234567890123").ok).toBe(false);
    expect(checkPassword("correct-horse-battery-9").ok).toBe(true);
  });

  it("rejects obvious personal and common passwords", () => {
    expect(
      checkPassword("password12345", { email: "user@example.com" }).ok,
    ).toBe(false);
    expect(
      checkPassword("maya-is-the-analyst-1", { name: "Maya Chen" }).ok,
    ).toBe(false);
    expect(
      checkPassword("maya-is-the-analyst-1", { name: "Jordan Lee" }).ok,
    ).toBe(true);
  });
});

describe("runtime modes", () => {
  const originalBilling = process.env.BILLING_MODE;
  const originalExecution = process.env.SCAN_EXECUTION;

  afterEach(() => {
    if (originalBilling === undefined) delete process.env.BILLING_MODE;
    else process.env.BILLING_MODE = originalBilling;
    if (originalExecution === undefined) delete process.env.SCAN_EXECUTION;
    else process.env.SCAN_EXECUTION = originalExecution;
  });

  it("defaults to free billing and inline scans", () => {
    delete process.env.BILLING_MODE;
    delete process.env.SCAN_EXECUTION;
    expect(billingMode()).toBe("free");
    expect(scanExecution()).toBe("inline");
  });

  it("only enables simulated billing when explicitly requested", () => {
    process.env.BILLING_MODE = "simulated";
    expect(billingMode()).toBe("simulated");
    process.env.BILLING_MODE = "stripe";
    expect(billingMode()).toBe("free");
  });

  it("only moves scanning to a worker when explicitly requested", () => {
    process.env.SCAN_EXECUTION = "worker";
    expect(scanExecution()).toBe("worker");
    process.env.SCAN_EXECUTION = "inline";
    expect(scanExecution()).toBe("inline");
  });
});
