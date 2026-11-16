/**
 * Runtime configuration. Values are read lazily so `next build` can run
 * without production secrets present; the server validates them at boot.
 */

const DEV_SESSION_SECRET =
  "dev-only-session-secret-change-me-32-bytes-minimum";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sessionSecret(): string {
  const value = process.env.SESSION_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (isProduction()) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production");
  }
  return DEV_SESSION_SECRET;
}

export function appUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error("APP_URL must use http or https");
      }
      return configured;
    } catch {
      if (isProduction()) throw new Error("APP_URL is not a valid absolute URL");
    }
  }
  if (isProduction()) {
    throw new Error("APP_URL is required in production");
  }
  return "http://localhost:3000";
}

export type BillingMode = "free" | "simulated";

export function billingMode(): BillingMode {
  return process.env.BILLING_MODE === "simulated" ? "simulated" : "free";
}

export function isFreeMode(): boolean {
  return billingMode() === "free";
}

export type ScanExecutionMode = "inline" | "worker";

export function scanExecution(): ScanExecutionMode {
  return process.env.SCAN_EXECUTION === "worker" ? "worker" : "inline";
}

export function demoMode(): boolean {
  if (process.env.DEMO_MODE === "1") return true;
  if (process.env.DEMO_MODE === "0") return false;
  return !isProduction();
}

export function allowSampleSource(): boolean {
  if (process.env.ALLOW_SAMPLE_SOURCE === "1") return true;
  if (process.env.ALLOW_SAMPLE_SOURCE === "0") return false;
  return !isProduction();
}

export function trustProxy(): boolean {
  return process.env.TRUST_PROXY === "1";
}

/**
 * Open access mode: no sign-in, no invitations, no MFA. Every page resolves to
 * a single operator identity so the whole product can be exercised without
 * credentials (local evaluation, demos, screenshots).
 *
 * Defaults on outside production; production requires OPEN_ACCESS=1 to opt in
 * explicitly. Set OPEN_ACCESS=0 to restore normal sign-in locally.
 */
export function openAccess(): boolean {
  const value = process.env.OPEN_ACCESS?.trim();
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return !isProduction();
}

/**
 * Freelancer mode publishes automated scan results directly, without an
 * internal analyst or service-terms gate. Set SOLO_MODE=0 to use the
 * analyst-reviewed service workflow instead.
 */
export function soloMode(): boolean {
  const value = process.env.SOLO_MODE?.trim();
  if (value === "0" || value === "false") return false;
  return true;
}

/** Staff can read client source and finalize reports; require a second factor. */
export function requireStaffMfa(): boolean {
  if (process.env.REQUIRE_STAFF_MFA === "0") return false;
  if (process.env.REQUIRE_STAFF_MFA === "1") return true;
  return isProduction();
}

export function dataDir(): string {
  return process.env.DATA_DIR?.trim() || ".data";
}

export function sourceRetentionDays(): number {
  const parsed = Number.parseInt(process.env.SOURCE_RETENTION_DAYS ?? "30", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

export function mailFrom(): string {
  const value = process.env.MAIL_FROM?.trim();
  if (value) return value;
  if (isProduction()) {
    throw new Error("MAIL_FROM is required in production");
  }
  return "VibeCheck <no-reply@vibecheck.local>";
}

export function resendApiKey(): string | null {
  return process.env.RESEND_API_KEY?.trim() || null;
}

/**
 * Live OSV advisory lookups. Enabled by default; set OSV_OFFLINE=1 for an
 * air-gapped install, which falls back to the bundled advisory set.
 */
export function osvOffline(): boolean {
  return process.env.OSV_OFFLINE === "1";
}

/** Semgrep is optional and disabled by default; it requires a pinned local CLI. */
export function semgrepEnabled(): boolean {
  return process.env.SEMGREP_ENABLED === "1";
}

export function logLevel(): "debug" | "info" | "warn" | "error" {
  const value = process.env.LOG_LEVEL;
  if (value === "debug" || value === "info" || value === "warn" || value === "error") {
    return value;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/** Returns human-readable configuration problems. Does not throw. */
export function configurationProblems(): string[] {
  const problems: string[] = [];
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters");
  }
  const url = process.env.APP_URL?.trim();
  if (!url) {
    problems.push("APP_URL is required (for invite, reset, and notification links)");
  } else {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        problems.push("APP_URL must be an absolute http(s) URL");
      }
      if (isProduction() && parsed.protocol !== "https:") {
        problems.push("APP_URL should use https in production");
      }
    } catch {
      problems.push("APP_URL is not a valid URL");
    }
  }
  if (!process.env.DATABASE_URL?.trim()) {
    problems.push("DATABASE_URL is required");
  }
  if (!process.env.MAIL_FROM?.trim()) {
    problems.push("MAIL_FROM is required");
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    problems.push("RESEND_API_KEY is missing; outbound email will fail");
  }
  if (process.env.BILLING_MODE && !["free", "simulated"].includes(process.env.BILLING_MODE)) {
    problems.push("BILLING_MODE must be free or simulated");
  }
  if (process.env.SCAN_EXECUTION && !["inline", "worker"].includes(process.env.SCAN_EXECUTION)) {
    problems.push("SCAN_EXECUTION must be inline or worker");
  }
  if (process.env.SEMGREP_ENABLED && !["0", "1"].includes(process.env.SEMGREP_ENABLED)) {
    problems.push("SEMGREP_ENABLED must be 0 or 1");
  }
  return problems;
}

export function validateRuntimeEnv(): void {
  const problems = configurationProblems();
  if (problems.length === 0) return;
  if (isProduction()) {
    throw new Error(`Invalid runtime configuration:\n- ${problems.join("\n- ")}`);
  }
  // Missing email configuration is expected during local development.
  const blocking = problems.filter(
    (problem) => !problem.startsWith("RESEND_API_KEY") && !problem.startsWith("MAIL_FROM"),
  );
  if (blocking.length > 0) {
    console.warn(`[config] ${blocking.join("; ")}`);
  }
}
