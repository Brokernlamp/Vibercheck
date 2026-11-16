import semver from "semver";
import type { FileContext, RawFinding } from "./types";
import { lineAt, snippetAround } from "./types";
import { fingerprintFor } from "./fingerprint";
import {
  ADVISORIES,
  KNOWN_LICENSES,
  restrictiveLicense,
  type Ecosystem,
} from "./advisories";
import { isLockfile, parseNpmLockfile } from "./lockfiles";
import { dependencyKey, type OsvAdvisory } from "./osv";
import { SEVERITY_ORDER, type Severity } from "../domain";

export interface DependencyRecord {
  name: string;
  version: string;
  ecosystem: Ecosystem;
  manifestPath: string;
  line: number;
  snippet: string;
  /** Declared directly by the repository rather than pulled in transitively. */
  direct: boolean;
  /** Development-only dependency. */
  dev: boolean;
  /** Version came from a lockfile instead of a resolved range. */
  locked: boolean;
}

const MAX_OSV_IDS_IN_DESCRIPTION = 8;

function findLine(content: string, needle: string): number {
  const index = content.indexOf(needle);
  return index >= 0 ? lineAt(content, index) : 1;
}

function cleanVersion(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  if (/^(?:workspace|file|git|github|link|portal):/i.test(value)) return null;
  if (value === "*" || value === "latest") return null;
  value = value.replace(/^npm:[^@]+@/, "");
  const min = semver.minVersion(value);
  return min?.version ?? null;
}

interface DeclaredDependency {
  name: string;
  range: string | null;
  version: string | null;
  line: number;
  snippet: string;
  dev: boolean;
}

function parseNpmManifest(ctx: FileContext): DeclaredDependency[] {
  try {
    const manifest = JSON.parse(ctx.content) as Record<string, unknown>;
    const groups: Array<[string | undefined, boolean]> = [
      ["dependencies", false],
      ["devDependencies", true],
      ["optionalDependencies", false],
      ["peerDependencies", false],
    ];
    const results: DeclaredDependency[] = [];
    for (const [group, dev] of groups) {
      const entries = manifest[group as string];
      if (!entries || typeof entries !== "object") continue;
      for (const [name, range] of Object.entries(entries as Record<string, unknown>)) {
        if (typeof range !== "string") continue;
        const line = findLine(ctx.content, `"${name}"`);
        results.push({
          name,
          range,
          version: cleanVersion(range),
          line,
          snippet: snippetAround(ctx.lines, line, line, 0),
          dev,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

function parsePythonRequirements(ctx: FileContext): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  ctx.lines.forEach((lineText, index) => {
    const line = lineText.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) return;
    const match = /^([A-Za-z0-9_.-]+)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9_.+-]+)/.exec(line);
    if (!match) return;
    deps.push({
      name: match[1]!.toLowerCase(),
      range: null,
      version: semver.coerce(match[2]!)?.version ?? match[2]!,
      line: index + 1,
      snippet: line.slice(0, 240),
      dev: /requirements-dev|requirements-test/i.test(ctx.path),
    });
  });
  return deps;
}

function siblingDir(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  return index >= 0 ? filePath.slice(0, index) : "";
}

/**
 * Builds the dependency inventory for a repository. Exact versions from npm
 * lockfiles win over the minimum version implied by a declared range, which is
 * what makes dependency findings match what is actually installed.
 */
export function collectDependencies(files: FileContext[]): DependencyRecord[] {
  const npmManifests = files.filter(
    (file) => !isLockfile(file.path) && (file.path === "package.json" || file.path.endsWith("/package.json")),
  );
  const lockfiles = files.filter((file) => isLockfile(file.path));
  const requirementFiles = files.filter((file) => {
    const base = file.path.split("/").pop() ?? "";
    return base === "requirements.txt" || base === "requirements-dev.txt";
  });

  const byKey = new Map<string, DependencyRecord>();
  const declaredByManifest = new Map(
    npmManifests.map((manifest) => [manifest.path, parseNpmManifest(manifest)]),
  );

  for (const manifest of npmManifests) {
    for (const declared of declaredByManifest.get(manifest.path) ?? []) {
      if (!declared.version) continue;
      const key = `npm:${declared.name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing && existing.locked) continue;
      byKey.set(key, {
        name: declared.name,
        version: declared.version,
        ecosystem: "npm",
        manifestPath: manifest.path,
        line: declared.line,
        snippet: declared.snippet,
        direct: true,
        dev: declared.dev,
        locked: false,
      });
    }
  }

  for (const lockfile of lockfiles) {
    const dir = siblingDir(lockfile.path);
    const manifestPath = dir ? `${dir}/package.json` : "package.json";
    const declared = declaredByManifest.get(manifestPath) ?? [];
    const declaredByName = new Map(declared.map((entry) => [entry.name.toLowerCase(), entry]));

    for (const locked of parseNpmLockfile(lockfile)) {
      const key = `npm:${locked.name.toLowerCase()}`;
      const declaredEntry = declaredByName.get(locked.name.toLowerCase());
      const direct = locked.direct || Boolean(declaredEntry);
      byKey.set(key, {
        name: locked.name,
        version: locked.version,
        ecosystem: "npm",
        manifestPath: direct && declaredEntry ? manifestPath : lockfile.path,
        line: direct && declaredEntry ? declaredEntry.line : 1,
        snippet: direct && declaredEntry
          ? declaredEntry.snippet
          : `${locked.name}@${locked.version} (resolved by ${lockfile.path})`,
        direct,
        dev: locked.dev || Boolean(declaredEntry?.dev),
        locked: true,
      });
    }

    // A declaration with no lockfile entry (optional or platform-specific) is
    // still worth reporting from its declared range.
    for (const declaredEntry of declared) {
      if (!declaredEntry.version) continue;
      const key = `npm:${declaredEntry.name.toLowerCase()}`;
      const existing = byKey.get(key);
      if (existing?.locked) continue;
      byKey.set(key, {
        name: declaredEntry.name,
        version: declaredEntry.version,
        ecosystem: "npm",
        manifestPath,
        line: declaredEntry.line,
        snippet: declaredEntry.snippet,
        direct: true,
        dev: declaredEntry.dev,
        locked: false,
      });
    }
  }

  for (const requirements of requirementFiles) {
    for (const declared of parsePythonRequirements(requirements)) {
      if (!declared.version) continue;
      const key = `pypi:${declared.name.toLowerCase()}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        name: declared.name,
        version: declared.version,
        ecosystem: "pypi",
        manifestPath: requirements.path,
        line: declared.line,
        snippet: declared.snippet,
        direct: true,
        dev: declared.dev,
        locked: true,
      });
    }
  }

  return [...byKey.values()];
}

function severityOf(severity: Severity): number {
  const rank = SEVERITY_ORDER.indexOf(severity);
  return rank < 0 ? SEVERITY_ORDER.length : rank;
}

function worstSeverity(values: Severity[]): Severity {
  return values.reduce<Severity>(
    (worst, value) => (severityOf(value) < severityOf(worst) ? value : worst),
    "INFO",
  );
}

function highestFixed(advisories: OsvAdvisory[]): string | null {
  const fixed = advisories
    .map((advisory) => advisory.fixed)
    .filter((value): value is string => Boolean(value) && semver.valid(value!) !== null);
  if (fixed.length === 0) return null;
  return fixed.sort(semver.rcompare)[0] ?? null;
}

/** One finding per vulnerable package, so a single stale dependency cannot flood a report. */
function feedFindings(
  dependencies: DependencyRecord[],
  advisories: Map<string, OsvAdvisory[]>,
): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const dependency of dependencies) {
    const matches = advisories.get(
      dependencyKey({
        name: dependency.name,
        version: dependency.version,
        ecosystem: dependency.ecosystem,
      }),
    );
    if (!matches || matches.length === 0) continue;

    const severity = worstSeverity(matches.map((match) => match.severity));
    const ids = [
      ...new Set(matches.map((match) => match.cve ?? match.id)),
    ].sort((a, b) => a.localeCompare(b));
    const sortedMatches = [...matches].sort(
      (a, b) => severityOf(a.severity) - severityOf(b.severity) || a.id.localeCompare(b.id),
    );
    const top = sortedMatches[0]!;
    const fixed = highestFixed(matches);
    const installed = `${dependency.name}@${dependency.version}`;
    const listed = ids.slice(0, MAX_OSV_IDS_IN_DESCRIPTION).join(", ");
    const extra = ids.length - MAX_OSV_IDS_IN_DESCRIPTION;
    const scope = dependency.dev
      ? "development dependency"
      : dependency.direct
        ? "direct dependency"
        : "transitive dependency";

    findings.push({
      ruleId: "SCA-VULN-001",
      source: "SCA",
      title:
        ids.length === 1
          ? `Vulnerable dependency: ${installed} (${ids[0]})`
          : `Vulnerable dependency: ${installed} (${ids.length} advisories)`,
      severity,
      cwe: ["CWE-1104"],
      owasp: "A03",
      category: "Vulnerable dependency",
      filePath: dependency.manifestPath,
      lineStart: dependency.line,
      lineEnd: dependency.line,
      snippet: dependency.snippet,
      description: `${installed} is a ${scope} with ${
        ids.length === 1 ? "a published advisory" : `${ids.length} published advisories`
      }: ${listed}${extra > 0 ? ` and ${extra} more` : ""}. Highest severity: ${
        top.severity.toLowerCase()
      } — ${top.summary} Versions are resolved from ${
        dependency.locked ? "the lockfile" : "the declared range"
      }, so this reflects what would be installed.`,
      remediation: fixed
        ? `Upgrade ${dependency.name} to ${fixed} or later, regenerate the lockfile, and re-scan. If a major upgrade is required, check the changelog for breaking changes and pin the fix first.`
        : `No fixed release is published for ${dependency.name} yet. Pin the current version, isolate the component, or replace the package, and track the advisory for a patched release.`,
      confidence: dependency.dev ? 88 : 97,
      fingerprint: fingerprintFor(
        "SCA-VULN-001",
        dependency.manifestPath,
        `${installed}:${ids.length}`,
      ),
    });
  }
  return findings;
}

/** Offline fallback: the curated advisory set, evaluated with semver ranges. */
function curatedFindings(dependencies: DependencyRecord[]): RawFinding[] {
  const findings: RawFinding[] = [];
  const seen = new Set<string>();
  for (const dependency of dependencies) {
    for (const advisory of ADVISORIES) {
      if (advisory.ecosystem !== dependency.ecosystem) continue;
      if (advisory.package.toLowerCase() !== dependency.name.toLowerCase()) continue;
      let affected = false;
      try {
        affected = semver.satisfies(dependency.version, advisory.vulnerable, {
          includePrerelease: true,
        });
      } catch {
        affected = false;
      }
      if (!affected) continue;
      const key = `${advisory.id}:${dependency.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const installed = `${dependency.name}@${dependency.version}`;
      findings.push({
        ruleId: "SCA-VULN-001",
        source: "SCA",
        title: `Vulnerable dependency: ${installed} (${advisory.id})`,
        severity: advisory.severity,
        cwe: ["CWE-1104"],
        owasp: "A03",
        category: "Vulnerable dependency",
        filePath: dependency.manifestPath,
        lineStart: dependency.line,
        lineEnd: dependency.line,
        snippet: dependency.snippet,
        description: `${advisory.summary} Version ${dependency.version} is inside the affected range (${advisory.vulnerable}). This result came from the offline advisory set, because the live OSV database was unreachable.`,
        remediation: `Upgrade ${dependency.name} to ${advisory.fixedIn} or later, regenerate the lockfile, and run the application's test suite. Check for transitive consumers that pin the old version.`,
        confidence: dependency.dev ? 82 : 90,
        fingerprint: fingerprintFor(
          "SCA-VULN-001",
          dependency.manifestPath,
          `${advisory.id}:${installed}`,
        ),
      });
    }
  }
  return findings;
}

function licenseFindings(
  manifests: FileContext[],
  rootDependencies: DependencyRecord[],
): RawFinding[] {
  const findings: RawFinding[] = [];
  const seen = new Set<string>();

  for (const dependency of rootDependencies) {
    const known = KNOWN_LICENSES[dependency.name];
    if (!known) continue;
    if (
      known.appliesAtOrAbove &&
      semver.lt(dependency.version, known.appliesAtOrAbove)
    ) {
      continue;
    }
    const key = `${dependency.manifestPath}:${dependency.name}:${known.license}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({
      ruleId: "SCA-LICENSE-001",
      source: "LICENSE",
      title: `Restrictive dependency license: ${dependency.name} (${known.license})`,
      severity: known.severity,
      cwe: [],
      owasp: "N/A",
      category: "License compliance",
      filePath: dependency.manifestPath,
      lineStart: dependency.line,
      lineEnd: dependency.line,
      snippet: dependency.snippet,
      description: `${known.note} Package ${dependency.name}@${dependency.version} is a direct dependency. License obligations can affect distribution or hosted-service terms. This is an engineering flag, not legal advice.`,
      remediation: `Confirm ${known.license} obligations with counsel. If they are incompatible with the product, replace ${dependency.name} or isolate the component before launch.`,
      confidence: 88,
      fingerprint: fingerprintFor(
        "SCA-LICENSE-001",
        dependency.manifestPath,
        `${dependency.name}:${known.license}`,
      ),
    });
  }

  const rootPath = manifests.find((manifest) => manifest.path === "package.json")?.path ?? null;
  for (const manifest of manifests) {
    if (manifest.path === rootPath) continue;
    try {
      const parsed = JSON.parse(manifest.content) as {
        name?: unknown;
        license?: unknown;
      };
      const license = typeof parsed.license === "string" ? parsed.license : null;
      if (!license) continue;
      const restrictive = restrictiveLicense(license);
      if (!restrictive) continue;
      const line = findLine(manifest.content, '"license"');
      const pkgName =
        typeof parsed.name === "string"
          ? parsed.name
          : manifest.path.split("/").slice(-2).join("/");
      const key = `${manifest.path}:${license}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        ruleId: "SCA-LICENSE-001",
        source: "LICENSE",
        title: `Restrictive license: ${pkgName} uses ${restrictive.label}`,
        severity: restrictive.severity,
        cwe: [],
        owasp: "N/A",
        category: "License compliance",
        filePath: manifest.path,
        lineStart: line,
        lineEnd: line,
        snippet: snippetAround(manifest.lines, line, line, 0),
        description: `A vendored or nested package declares ${restrictive.label}. Copyleft and source-available licenses can impose distribution or service obligations on the product.`,
        remediation:
          "Verify the license with counsel, confirm whether the code is actually distributed, and replace or isolate the dependency if obligations conflict with the product model.",
        confidence: 90,
        fingerprint: fingerprintFor(
          "SCA-LICENSE-001",
          manifest.path,
          `${pkgName}:${license}`,
        ),
      });
    } catch {
      // Ignore malformed manifests; parsing is best-effort.
    }
  }

  return findings;
}

export function scanDependencies(
  files: FileContext[],
  options: { advisories?: Map<string, OsvAdvisory[]> } = {},
): RawFinding[] {
  const dependencies = collectDependencies(files);
  const manifests = files.filter(
    (file) => !isLockfile(file.path) && file.path.endsWith("package.json"),
  );
  const rootPath = files.some((file) => file.path === "package.json")
    ? "package.json"
    : null;
  const rootDependencies = dependencies.filter(
    (dependency) =>
      dependency.ecosystem === "npm" &&
      dependency.direct &&
      (rootPath ? dependency.manifestPath === rootPath : true),
  );

  return [
    ...(options.advisories
      ? feedFindings(dependencies, options.advisories)
      : curatedFindings(dependencies)),
    ...licenseFindings(manifests, rootDependencies),
  ];
}
