import semver from "semver";
import type { Severity } from "../domain";
import type { Ecosystem } from "./advisories";

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns/";
const BATCH_SIZE = 400;
const BATCH_TIMEOUT_MS = 20_000;
const DETAIL_TIMEOUT_MS = 10_000;
const QUERY_TTL_MS = 6 * 60 * 60 * 1000;
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const DETAIL_CONCURRENCY = 6;
const MAX_DETAIL_LOOKUPS = 500;

export interface DependencyQuery {
  name: string;
  version: string;
  ecosystem: Ecosystem;
}

export interface OsvAdvisory {
  id: string;
  cve: string | null;
  severity: Severity;
  summary: string;
  fixed: string | null;
}

interface OsvAffected {
  package?: { name?: string; ecosystem?: string };
  ranges?: Array<{ events?: Array<{ introduced?: string; fixed?: string }> }>;
}

interface OsvVulnerability {
  id?: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type?: string; score?: string }>;
  database_specific?: { severity?: string };
  ecosystem_specific?: { severity?: string };
  affected?: OsvAffected[];
}

const queryCache = new Map<string, { ids: string[]; at: number }>();
const detailCache = new Map<string, { value: OsvVulnerability | null; at: number }>();

export function dependencyKey(dependency: DependencyQuery): string {
  return `${dependency.ecosystem}:${dependency.name.toLowerCase()}@${dependency.version}`;
}

/**
 * OSV ecosystem identifiers are case-sensitive ("npm" but "PyPI"), and an
 * unknown value makes the whole batch fail with HTTP 400.
 */
function osvEcosystem(ecosystem: Ecosystem): string {
  return ecosystem === "pypi" ? "PyPI" : "npm";
}

const SEVERITY_MAP: Record<string, Severity> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MEDIUM",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

function mapSeverity(value: unknown): Severity | null {
  if (typeof value !== "string") return null;
  return SEVERITY_MAP[value.trim().toUpperCase()] ?? null;
}

function cveFor(vulnerability: OsvVulnerability): string | null {
  const aliases = Array.isArray(vulnerability.aliases) ? vulnerability.aliases : [];
  const cve = aliases.find((alias) => /^CVE-\d{4}-\d+$/i.test(alias));
  if (cve) return cve.toUpperCase();
  if (typeof vulnerability.id === "string" && /^CVE-/i.test(vulnerability.id)) {
    return vulnerability.id.toUpperCase();
  }
  return null;
}

/** Smallest published fix for this package that is newer than the installed version. */
function fixedVersion(
  vulnerability: OsvVulnerability,
  dependency: DependencyQuery,
): string | null {
  const affected = Array.isArray(vulnerability.affected) ? vulnerability.affected : [];
  const candidates: string[] = [];
  for (const entry of affected) {
    const name = entry.package?.name?.toLowerCase();
    const ecosystem = entry.package?.ecosystem?.toLowerCase();
    if (name && name !== dependency.name.toLowerCase()) continue;
    if (ecosystem && ecosystem !== dependency.ecosystem.toLowerCase()) continue;
    for (const range of entry.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (typeof event.fixed === "string" && event.fixed.trim()) {
          candidates.push(event.fixed.trim());
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  const valid = candidates.filter((candidate) => semver.valid(candidate) !== null);
  if (valid.length === 0) return candidates[0] ?? null;
  const current = semver.valid(dependency.version)
    ? dependency.version
    : semver.coerce(dependency.version)?.version;
  if (!current) return valid.sort(semver.rcompare)[0] ?? null;
  const ahead = valid.filter((candidate) => semver.gt(candidate, current));
  return ahead.length > 0
    ? ahead.sort(semver.compare)[0]!
    : valid.sort(semver.rcompare)[0]!;
}

function severityFor(vulnerability: OsvVulnerability): Severity {
  return (
    mapSeverity(vulnerability.database_specific?.severity) ??
    mapSeverity(vulnerability.ecosystem_specific?.severity) ??
    "MEDIUM"
  );
}

function toAdvisory(
  vulnerability: OsvVulnerability,
  dependency: DependencyQuery,
): OsvAdvisory | null {
  const id = typeof vulnerability.id === "string" ? vulnerability.id : null;
  if (!id) return null;
  const summary =
    (typeof vulnerability.summary === "string" && vulnerability.summary.trim()) ||
    (typeof vulnerability.details === "string" ? vulnerability.details.slice(0, 240) : "") ||
    "Known vulnerability";
  return {
    id,
    cve: cveFor(vulnerability),
    severity: severityFor(vulnerability),
    summary: summary.trim(),
    fixed: fixedVersion(vulnerability, dependency),
  };
}

async function fetchBatch(queries: DependencyQuery[]): Promise<Array<string[]>> {
  const response = await fetch(OSV_BATCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: queries.map((dependency) => ({
        package: {
          name: dependency.name,
          ecosystem: osvEcosystem(dependency.ecosystem),
        },
        version: dependency.version,
      })),
    }),
    signal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`OSV querybatch failed with HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    results?: Array<{ vulns?: Array<{ id?: string }> }>;
  };
  const results = payload.results ?? [];
  return queries.map((_, index) =>
    (results[index]?.vulns ?? [])
      .map((vuln) => vuln.id)
      .filter((id): id is string => typeof id === "string"),
  );
}

async function fetchVulnerability(id: string): Promise<OsvVulnerability | null> {
  const cached = detailCache.get(id);
  if (cached && Date.now() - cached.at < DETAIL_TTL_MS) return cached.value;
  try {
    const response = await fetch(`${OSV_VULN_URL}${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    if (!response.ok) {
      detailCache.set(id, { value: null, at: Date.now() });
      return null;
    }
    const payload = (await response.json()) as OsvVulnerability;
    detailCache.set(id, { value: payload, at: Date.now() });
    return payload;
  } catch {
    // A single failed detail lookup should not fail the scan; other advisories
    // still land and the caller records a warning.
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export interface OsvLookupResult {
  /** Advisory list keyed by dependencyKey(). */
  advisories: Map<string, OsvAdvisory[]>;
  queried: number;
  failed: boolean;
  warnings: string[];
}

/**
 * Looks up advisories for exact dependency versions through the OSV database
 * (GitHub Advisory, NVD and ecosystem feeds). Query results and vulnerability
 * details are cached per process, so rescanning a repository costs one batch
 * round trip at most.
 */
export async function lookupAdvisories(
  dependencies: DependencyQuery[],
): Promise<OsvLookupResult> {
  const unique = new Map<string, DependencyQuery>();
  for (const dependency of dependencies) {
    const key = dependencyKey(dependency);
    if (!unique.has(key)) unique.set(key, dependency);
  }

  const advisories = new Map<string, OsvAdvisory[]>();
  const warnings: string[] = [];
  const missing: DependencyQuery[] = [];

  for (const [key, dependency] of unique) {
    const cached = queryCache.get(key);
    if (cached && Date.now() - cached.at < QUERY_TTL_MS) continue;
    missing.push(dependency);
  }

  if (missing.length > 0) {
    const idsByKey = new Map<string, string[]>();
    try {
      for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
        const chunk = missing.slice(offset, offset + BATCH_SIZE);
        const results = await fetchBatch(chunk);
        chunk.forEach((dependency, index) => {
          const ids = results[index] ?? [];
          idsByKey.set(dependencyKey(dependency), ids);
          queryCache.set(dependencyKey(dependency), { ids, at: Date.now() });
        });
      }
    } catch (error) {
      return {
        advisories,
        queried: missing.length,
        failed: true,
        warnings: [
          `Live advisory lookup failed: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ],
      };
    }
  }

  const pendingIds = new Set<string>();
  let capped = false;
  for (const [key] of unique) {
    const ids = queryCache.get(key)?.ids ?? [];
    for (const id of ids) {
      if (pendingIds.size >= MAX_DETAIL_LOOKUPS) {
        capped = true;
        break;
      }
      pendingIds.add(id);
    }
  }
  if (capped) {
    warnings.push(
      `Advisory detail lookups capped at ${MAX_DETAIL_LOOKUPS}; some dependencies were only partially described.`,
    );
  }

  const ids = [...pendingIds];
  const raws = await mapWithConcurrency(ids, DETAIL_CONCURRENCY, fetchVulnerability);
  const rawById = new Map<string, OsvVulnerability | null>();
  ids.forEach((id, index) => rawById.set(id, raws[index] ?? null));

  for (const [key, dependency] of unique) {
    const idsForDep = queryCache.get(key)?.ids ?? [];
    const list: OsvAdvisory[] = [];
    for (const id of idsForDep) {
      const raw = rawById.get(id);
      if (!raw) continue;
      const advisory = toAdvisory(raw, dependency);
      if (advisory) list.push(advisory);
    }
    list.sort((a, b) => a.id.localeCompare(b.id));
    advisories.set(key, list);
  }

  return { advisories, queried: missing.length, failed: false, warnings };
}

/** Test seam: drops the in-process advisory caches. */
export function clearAdvisoryCache(): void {
  queryCache.clear();
  detailCache.clear();
}
