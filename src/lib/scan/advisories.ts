import type { Severity } from "../domain";

export type Ecosystem = "npm" | "pypi";

export interface Advisory {
  id: string;
  ecosystem: Ecosystem;
  package: string;
  vulnerable: string;
  severity: Severity;
  summary: string;
  fixedIn: string;
}

/**
 * A deliberately small offline advisory set for the prototype. Production
 * should replace this with OSV / GitHub Advisory data through Trivy, Grype,
 * or osv-scanner so transitive dependencies and fresh CVEs are covered.
 */
export const ADVISORIES: Advisory[] = [
  {
    id: "CVE-2020-8203",
    ecosystem: "npm",
    package: "lodash",
    vulnerable: "<4.17.19",
    severity: "HIGH",
    summary:
      "Prototype pollution in lodash's zipObjectDeep can modify object prototypes when attacker-controlled paths are merged.",
    fixedIn: "4.17.19",
  },
  {
    id: "CVE-2021-23337",
    ecosystem: "npm",
    package: "lodash",
    vulnerable: "<4.17.21",
    severity: "HIGH",
    summary:
      "The lodash template function can execute injected code through crafted template options in older releases.",
    fixedIn: "4.17.21",
  },
  {
    id: "CVE-2021-44906",
    ecosystem: "npm",
    package: "minimist",
    vulnerable: "<1.2.6",
    severity: "CRITICAL",
    summary:
      "Prototype pollution in minimist can alter application behavior when parsing crafted command-line arguments.",
    fixedIn: "1.2.6",
  },
  {
    id: "CVE-2024-29041",
    ecosystem: "npm",
    package: "express",
    vulnerable: "<4.19.2",
    severity: "MEDIUM",
    summary:
      "Express can be induced to redirect to an attacker-controlled location when a malformed URL is handled by res.location/res.redirect.",
    fixedIn: "4.19.2",
  },
  {
    id: "CVE-2021-3749",
    ecosystem: "npm",
    package: "axios",
    vulnerable: "<0.21.2",
    severity: "HIGH",
    summary:
      "A regular-expression denial of service in axios can freeze the event loop while trimming attacker-controlled URLs.",
    fixedIn: "0.21.2",
  },
  {
    id: "CVE-2022-23540",
    ecosystem: "npm",
    package: "jsonwebtoken",
    vulnerable: "<9.0.0",
    severity: "HIGH",
    summary:
      "Older jsonwebtoken releases handle verification defaults insecurely, which can allow a token to be accepted with an unintended algorithm.",
    fixedIn: "9.0.0",
  },
  {
    id: "CVE-2025-29927",
    ecosystem: "npm",
    package: "next",
    vulnerable:
      ">=11.1.4 <13.5.7 || >=14.0.0 <14.2.25 || >=15.0.0 <15.2.3",
    severity: "CRITICAL",
    summary:
      "A crafted x-middleware-subrequest header can bypass Next.js middleware, including middleware used for authorization.",
    fixedIn: "14.2.25 / 15.2.3",
  },
  {
    id: "CVE-2024-37890",
    ecosystem: "npm",
    package: "ws",
    vulnerable: "<8.17.1",
    severity: "HIGH",
    summary:
      "The ws WebSocket server can crash from a request with many headers, enabling denial of service.",
    fixedIn: "8.17.1",
  },
  {
    id: "CVE-2020-14343",
    ecosystem: "pypi",
    package: "pyyaml",
    vulnerable: "<5.4",
    severity: "CRITICAL",
    summary:
      "PyYAML's full_load can construct arbitrary Python objects and execute code when fed untrusted YAML.",
    fixedIn: "5.4",
  },
  {
    id: "CVE-2023-32681",
    ecosystem: "pypi",
    package: "requests",
    vulnerable: "<2.31.0",
    severity: "MEDIUM",
    summary:
      "Requests may leak Proxy-Authorization headers to destination hosts when following redirects.",
    fixedIn: "2.31.0",
  },
  {
    id: "CVE-2023-30861",
    ecosystem: "pypi",
    package: "flask",
    vulnerable: "<2.2.5",
    severity: "HIGH",
    summary:
      "Flask may cache a response containing session data and serve it to a different client behind a caching proxy.",
    fixedIn: "2.2.5",
  },
  {
    id: "CVE-2024-56326",
    ecosystem: "pypi",
    package: "jinja2",
    vulnerable: "<3.1.5",
    severity: "HIGH",
    summary:
      "A sandbox escape in Jinja2 can execute arbitrary Python from an untrusted template.",
    fixedIn: "3.1.5",
  },
];

export interface KnownLicense {
  license: string;
  severity: Severity;
  note: string;
  appliesAtOrAbove?: string;
}

/**
 * License metadata for common packages in the demo, keyed by package name.
 * Production should read the actual license from the lockfile/SBOM and let
 * counsel decide policy per license.
 */
export const KNOWN_LICENSES: Record<string, KnownLicense> = {
  mongodb: {
    license: "SSPL-1.0",
    severity: "HIGH",
    note: "Server Side Public License is not OSI-approved and has service-use obligations.",
    appliesAtOrAbove: "4.0.0",
  },
  "@elastic/elasticsearch": {
    license: "Elastic-2.0",
    severity: "HIGH",
    note: "Elastic License 2.0 restricts providing the software as a managed service.",
    appliesAtOrAbove: "7.11.0",
  },
};

export function restrictiveLicense(
  license: string,
): { restricted: boolean; severity: Severity; label: string } | null {
  const normalized = license.trim();
  if (!normalized) return null;
  if (/^AGPL/i.test(normalized)) {
    return { restricted: true, severity: "CRITICAL", label: normalized };
  }
  if (/^(?:SSPL|BUSL|BSL)/i.test(normalized)) {
    return { restricted: true, severity: "HIGH", label: normalized };
  }
  if (/^GPL/i.test(normalized)) {
    return { restricted: true, severity: "HIGH", label: normalized };
  }
  if (/Elastic-2\.0|Commons Clause|CC-BY-NC/i.test(normalized)) {
    return { restricted: true, severity: "HIGH", label: normalized };
  }
  if (/^LGPL/i.test(normalized)) {
    return { restricted: true, severity: "MEDIUM", label: normalized };
  }
  return null;
}
