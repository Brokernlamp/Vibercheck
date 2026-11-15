import { createHash } from "node:crypto";

/**
 * Fingerprints intentionally exclude line numbers so unrelated edits do not
 * make every finding look new. Evidence is the normalized matched code or a
 * hash when the match contains a secret.
 */
export function fingerprintFor(
  ruleId: string,
  filePath: string,
  evidence: string,
): string {
  return createHash("sha256")
    .update(`${ruleId}\u0000${filePath}\u0000${evidence}`)
    .digest("hex")
    .slice(0, 32);
}
