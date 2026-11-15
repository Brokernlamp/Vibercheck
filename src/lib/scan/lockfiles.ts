import type { Ecosystem } from "./advisories";
import type { FileContext } from "./types";

export interface LockedPackage {
  name: string;
  version: string;
  ecosystem: Ecosystem;
  dev: boolean;
  /** True when the repository declares the package directly. */
  direct: boolean;
}

export const LOCKFILE_NAMES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
]);

export function isLockfile(filePath: string): boolean {
  const base = filePath.split("/").pop() ?? "";
  return LOCKFILE_NAMES.has(base);
}

function packageNameFromLockPath(key: string): string | null {
  const marker = key.lastIndexOf("node_modules/");
  if (marker < 0) return null;
  const name = key.slice(marker + "node_modules/".length).trim();
  return name && !name.includes("/node_modules/") ? name : null;
}

function isDirectLockPath(key: string, name: string): boolean {
  return key === `node_modules/${name}`;
}

/**
 * Reads an npm lockfile, which is the only place an exact installed version
 * (including transitive packages) is recorded. Without it a scanner can only
 * guess a version from the declared range, which produces both false positives
 * and misses.
 */
export function parseNpmLockfile(ctx: FileContext): LockedPackage[] {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(ctx.content) as Record<string, unknown>;
  } catch {
    return [];
  }
  const packages = manifest.packages as Record<string, unknown> | undefined;
  if (packages && typeof packages === "object") {
    const results: LockedPackage[] = [];
    for (const [key, value] of Object.entries(packages)) {
      if (!key || typeof value !== "object" || value === null) continue;
      const entry = value as { version?: unknown; dev?: unknown; devOptional?: unknown };
      const name = packageNameFromLockPath(key);
      if (!name || typeof entry.version !== "string") continue;
      results.push({
        name,
        version: entry.version,
        ecosystem: "npm",
        dev: entry.dev === true || entry.devOptional === true,
        direct: isDirectLockPath(key, name),
      });
    }
    if (results.length > 0) return results;
  }

  // Lockfile v1: a nested dependency tree.
  const tree = manifest.dependencies as Record<string, unknown> | undefined;
  if (!tree || typeof tree !== "object") return [];
  const results: LockedPackage[] = [];
  const walk = (
    deps: Record<string, unknown>,
    direct: boolean,
    depth: number,
  ): void => {
    if (depth > 8) return;
    for (const [name, value] of Object.entries(deps)) {
      if (typeof value !== "object" || value === null) continue;
      const entry = value as {
        version?: unknown;
        dev?: unknown;
        dependencies?: unknown;
      };
      if (typeof entry.version !== "string") continue;
      results.push({
        name,
        version: entry.version,
        ecosystem: "npm",
        dev: entry.dev === true,
        direct,
      });
      if (entry.dependencies && typeof entry.dependencies === "object") {
        walk(entry.dependencies as Record<string, unknown>, false, depth + 1);
      }
    }
  };
  walk(tree, true, 0);
  return results;
}
