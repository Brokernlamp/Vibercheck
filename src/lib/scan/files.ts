import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_SCAN_LIMITS, type FileContext, type ScanLimits } from "./types";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "dist",
  "build",
  "out",
  "coverage",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode",
  "target",
  "obj",
  "bin",
  ".terraform",
  "Pods",
  "DerivedData",
]);

const IGNORED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg", ".bmp", ".tiff",
  ".mp3", ".mp4", ".mov", ".avi", ".webm", ".wav", ".ogg",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".tar", ".gz", ".rar", ".7z", ".dmg", ".exe", ".bin", ".class",
  ".jar", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".sqlite", ".db", ".parquet", ".lockb",
]);

const IGNORED_FILES = new Set([
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "composer.lock",
  "Cargo.lock",
  "poetry.lock",
]);

/** npm lockfiles are read for exact installed versions and are allowed to be larger. */
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json"]);
const LOCKFILE_MAX_BYTES = 8 * 1024 * 1024;

export interface CollectedFiles {
  files: FileContext[];
  bytesScanned: number;
  skippedFiles: number;
  truncated: boolean;
}

function isProbablyBinary(buffer: Buffer): boolean {
  const window = buffer.subarray(0, Math.min(buffer.length, 8192));
  for (const byte of window) {
    if (byte === 0) return true;
  }
  return false;
}

/**
 * Reads a source tree as untrusted data. Symlinks are skipped so a scan cannot
 * escape the extracted source directory.
 */
export async function collectFiles(
  root: string,
  limits: ScanLimits = DEFAULT_SCAN_LIMITS,
): Promise<CollectedFiles> {
  const files: FileContext[] = [];
  let bytesScanned = 0;
  let skippedFiles = 0;
  let truncated = false;

  async function walk(dir: string, relative: string): Promise<void> {
    if (truncated) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (truncated) return;
      const allowedDotEntry =
        entry.name.startsWith(".env") ||
        entry.name === ".github" ||
        entry.name === ".gitlab" ||
        entry.name === ".npmrc" ||
        entry.name === ".pypirc" ||
        entry.name === ".git-credentials";
      if (entry.name.startsWith(".") && !allowedDotEntry) continue;
      const absolute = path.join(dir, entry.name);
      const rel = relative ? `${relative}/${entry.name}` : entry.name;

      if (entry.isSymbolicLink()) {
        skippedFiles += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          skippedFiles += 1;
          continue;
        }
        await walk(absolute, rel);
        continue;
      }
      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      const lowerName = entry.name.toLowerCase();
      if (IGNORED_EXTENSIONS.has(ext) || IGNORED_FILES.has(entry.name)) {
        skippedFiles += 1;
        continue;
      }
      if (lowerName.endsWith(".min.js") || lowerName.endsWith(".map")) {
        skippedFiles += 1;
        continue;
      }
      if (files.length >= limits.maxFiles) {
        truncated = true;
        return;
      }

      let stat;
      try {
        stat = await fs.stat(absolute);
      } catch {
        skippedFiles += 1;
        continue;
      }
      const maxBytes = LOCKFILES.has(entry.name)
        ? Math.max(limits.maxFileBytes, LOCKFILE_MAX_BYTES)
        : limits.maxFileBytes;
      if (stat.size === 0 || stat.size > maxBytes) {
        skippedFiles += 1;
        continue;
      }
      if (bytesScanned + stat.size > limits.maxTotalBytes) {
        truncated = true;
        return;
      }

      let buffer: Buffer;
      try {
        buffer = await fs.readFile(absolute);
      } catch {
        skippedFiles += 1;
        continue;
      }
      if (isProbablyBinary(buffer)) {
        skippedFiles += 1;
        continue;
      }

      const content = buffer.toString("utf8");
      files.push({
        path: rel.split(path.sep).join("/"),
        content,
        lines: content.split("\n"),
        ext,
      });
      bytesScanned += buffer.length;
    }
  }

  await walk(root, "");
  return { files, bytesScanned, skippedFiles, truncated };
}
