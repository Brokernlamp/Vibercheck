export const ASVS_VERSION = "5.0.0";
export const ASVS_LABEL = `OWASP ASVS ${ASVS_VERSION}`;
export const ASVS_SOURCE_URL =
  "https://github.com/OWASP/ASVS/tree/v5.0.0_release/5.0/en";

const CWE_TO_ASVS: Readonly<Record<string, readonly string[]>> = {
  "CWE-78": ["V1.2.5"],
  "CWE-79": ["V3.2.3"],
  "CWE-89": ["V1.2.4"],
  "CWE-95": ["V1.3.2"],
  "CWE-295": ["V12.2.2", "V12.3.4", "V12.3.5"],
  "CWE-306": ["V6.1.3", "V6.3.4", "V7.5.1", "V7.5.3"],
  "CWE-307": ["V6.1.1", "V6.3.1", "V6.6.3"],
  "CWE-338": ["V11.5.1", "V11.5.2"],
  "CWE-601": ["V3.7.2"],
  "CWE-732": ["V13.2.4"],
  "CWE-798": ["V6.3.2", "V7.2.2", "V13.3.1"],
  "CWE-915": ["V15.3.3"],
  "CWE-918": ["V1.3.6", "V13.2.5"],
};

function compareRequirements(left: string, right: string): number {
  const leftParts = left.slice(1).split(".").map(Number);
  const rightParts = right.slice(1).split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function asvsForCwe(cwes: readonly string[]): string[] {
  const requirements = new Set<string>();
  for (const cwe of cwes) {
    for (const requirement of CWE_TO_ASVS[cwe.toUpperCase()] ?? []) {
      requirements.add(requirement);
    }
  }
  return [...requirements].sort(compareRequirements);
}
