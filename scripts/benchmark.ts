import path from "node:path";
import { scanDirectory } from "../src/lib/scan/engine";
import { customRules } from "../src/lib/scan/rules";
import { secretRules } from "../src/lib/scan/secrets";

const EXPECTED = [
  ...customRules.map((rule) => rule.id),
  ...secretRules.map((rule) => rule.id),
  "SCA-VULN-001",
  "SCA-LICENSE-001",
];

// Fixtures are fixed in time, so the benchmark evaluates them against the
// bundled advisory set. The live OSV feed is exercised by the unit tests and by
// real scans; using it here would make results drift as new CVEs are published
// against the fixtures' pinned dependency versions.
const OFFLINE = { offline: true } as const;

async function main() {
  const vulnerable = await scanDirectory(
    path.resolve("benchmarks/vulnerable-app"),
    undefined,
    OFFLINE,
  );
  const clean = await scanDirectory(
    path.resolve("benchmarks/clean-app"),
    undefined,
    OFFLINE,
  );

  const seen = new Set(vulnerable.findings.map((finding) => finding.ruleId));
  const missing = EXPECTED.filter((ruleId) => !seen.has(ruleId));

  console.log(
    `Vulnerable fixture: ${vulnerable.findings.length} findings, risk ${vulnerable.score}/${vulnerable.grade}, ${vulnerable.filesScanned} files, ${vulnerable.durationMs}ms`,
  );
  console.log(
    `Clean fixture: ${clean.findings.length} findings, risk ${clean.score}/${clean.grade}`,
  );
  if (clean.findings.length > 0) {
    console.log("\nClean findings (false positives):");
    for (const finding of clean.findings) {
      console.log(
        `  ${finding.ruleId} ${finding.filePath}:${finding.lineStart} — ${finding.title}`,
      );
    }
  }
  console.log(
    `\nBuilt-in checks exercised by the vulnerable fixture: ${seen.size}/${EXPECTED.length} (fixture coverage only; not accuracy or recall)`,
  );
  if (missing.length) {
    console.log(`Missing expected rules:\n  ${missing.join("\n  ")}`);
  }
  if (vulnerable.warnings.length) {
    console.log(`\nWarnings:\n  ${vulnerable.warnings.join("\n  ")}`);
  }
  console.log(
    "\nNote: dependency checks here use the bundled advisory set for determinism." +
      "\nReal scans query OSV live; these pinned versions do have published advisories." +
      "\nSet OSV_OFFLINE=1 only when you want the bundled set in the app itself.",
  );
  process.exitCode = missing.length > 0 || clean.findings.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
