import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync, type UnzipFileInfo } from "fflate";

const execFileAsync = promisify(execFile);
const DATA_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.DATA_DIR ?? ".data",
);
const SOURCE_ROOT = path.join(DATA_ROOT, "sources");

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 40 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 3000;

const IGNORED_PREFIXES = [
  "node_modules/",
  ".git/",
  ".next/",
  "__MACOSX/",
  ".DS_Store",
];

const ALLOWED_GIT_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "gitlab.com",
  "www.gitlab.com",
]);

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(value)) {
    throw new Error("Invalid source path segment");
  }
  return value;
}

export async function newSourceDirectory(
  engagementId: string,
  scanId: string,
): Promise<string> {
  const destination = path.join(
    SOURCE_ROOT,
    safeSegment(engagementId),
    safeSegment(scanId),
    "repo",
  );
  // Create only the parent: git clone refuses a non-empty destination.
  // Source snapshots are private to the service account.
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  return destination;
}

function normalizeEntryName(raw: string): string | null {
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "").trim();
  if (!normalized || normalized.endsWith("/")) return null;
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("Archive contains an absolute path");
  }
  if (normalized.includes("\0")) throw new Error("Archive contains an invalid path");
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) {
    throw new Error("Archive contains a path traversal entry");
  }
  return segments.join("/");
}

function ignoredEntry(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower === ".ds_store") return true;
  return IGNORED_PREFIXES.some((prefix) => lower.startsWith(prefix.toLowerCase()));
}

function isZip(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

export interface IngestStats {
  files: number;
  bytes: number;
  skipped: number;
}

export async function extractZip(
  buffer: Buffer,
  destination: string,
): Promise<IngestStats> {
  if (buffer.length === 0) throw new Error("The uploaded archive is empty");
  if (buffer.length > MAX_ARCHIVE_BYTES) {
    throw new Error("The archive exceeds the 25 MB upload limit");
  }
  if (!isZip(buffer)) throw new Error("The uploaded file is not a valid .zip archive");

  let totalBytes = 0;
  let kept = 0;
  let skipped = 0;
  let limitExceeded = false;
  let unsafePath: string | null = null;

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(buffer), {
      filter: (file: UnzipFileInfo) => {
        if (unsafePath) return false;
        let normalized: string | null;
        try {
          normalized = normalizeEntryName(file.name);
        } catch (error) {
          unsafePath = error instanceof Error ? error.message : "Unsafe archive path";
          return false;
        }
        if (!normalized || ignoredEntry(normalized)) {
          skipped += 1;
          return false;
        }
        if (
          file.originalSize > MAX_FILE_BYTES ||
          totalBytes + file.originalSize > MAX_EXTRACTED_BYTES ||
          kept >= MAX_ENTRIES
        ) {
          limitExceeded = true;
          return false;
        }
        totalBytes += file.originalSize;
        kept += 1;
        return true;
      },
    });
  } catch {
    throw new Error("The archive could not be read. It may be corrupt or encrypted.");
  }

  if (unsafePath) throw new Error(unsafePath);
  if (limitExceeded) {
    throw new Error(
      "The archive expands beyond the 40 MB / 3,000 file scan limit. Upload a smaller repository.",
    );
  }

  const names = Object.keys(entries);
  if (names.length === 0) {
    throw new Error("The archive contains no scannable files");
  }

  const root = path.resolve(destination);
  let written = 0;
  for (const name of names) {
    const normalized = name.replace(/\\/g, "/").replace(/^\.\//, "");
    const target = path.resolve(root, ...normalized.split("/"));
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error("Archive entry escaped the extraction directory");
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entries[name]);
    written += 1;
  }

  return { files: written, bytes: totalBytes, skipped };
}

export function validateRepositoryUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!ALLOWED_GIT_HOSTS.has(url.hostname.toLowerCase())) return null;
    if (url.search || url.hash) return null;
    const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
    if (parts.length !== 2) return null;
    if (!/^[A-Za-z0-9_.-]+$/.test(parts[0]) || !/^[A-Za-z0-9_.-]+$/.test(parts[1])) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function githubRepositoryKey(input: string | null): string | null {
  if (!input) return null;
  const safeUrl = validateRepositoryUrl(input);
  if (!safeUrl) return null;
  const url = new URL(safeUrl);
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    return null;
  }
  const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (!owner || !repo) return null;
  return `${owner.toLowerCase()}/${repo.replace(/\.git$/i, "").toLowerCase()}`;
}

export async function cloneRepository(
  repoUrl: string,
  destination: string,
  options: { githubToken?: string; ref?: string } = {},
): Promise<IngestStats> {
  const safeUrl = validateRepositoryUrl(repoUrl);
  if (!safeUrl) {
    throw new Error(
      "Use an HTTPS GitHub or GitLab repository URL. Private GitHub repositories require a configured VibeCheck GitHub App installation.",
    );
  }
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const parsed = new URL(safeUrl);
  if (options.githubToken && parsed.hostname !== "github.com" && parsed.hostname !== "www.github.com") {
    throw new Error("GitHub App access tokens can only be used with GitHub repositories.");
  }
  if (
    options.ref &&
    parsed.hostname !== "github.com" &&
    parsed.hostname !== "www.github.com"
  ) {
    throw new Error("Commit-pinned repository scans require GitHub.");
  }
  if (options.ref && !/^[a-f0-9]{40}$/i.test(options.ref)) {
    throw new Error("The requested GitHub commit is invalid.");
  }
  const gitEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
  };
  if (options.githubToken) {
    gitEnvironment.GIT_CONFIG_COUNT = "1";
    gitEnvironment.GIT_CONFIG_KEY_0 = "http.extraheader";
    gitEnvironment.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(
      `x-access-token:${options.githubToken}`,
    ).toString("base64")}`;
  };
  try {
    if (options.ref) {
      await execFileAsync("git", ["init", destination], {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: gitEnvironment,
      });
      await execFileAsync("git", ["-C", destination, "remote", "add", "origin", safeUrl], {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: gitEnvironment,
      });
      await execFileAsync(
        "git",
        ["-C", destination, "fetch", "--depth=1", "--no-tags", "origin", options.ref],
        {
          timeout: 120_000,
          maxBuffer: 2 * 1024 * 1024,
          env: gitEnvironment,
        },
      );
      await execFileAsync("git", ["-C", destination, "checkout", "--detach", "FETCH_HEAD"], {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: gitEnvironment,
      });
    } else {
      await execFileAsync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--single-branch",
          "--no-tags",
          safeUrl,
          destination,
        ],
        {
          timeout: 120_000,
          maxBuffer: 2 * 1024 * 1024,
          env: gitEnvironment,
        },
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "git clone failed";
    throw new Error(
      `Could not clone the repository. Confirm it is public and the URL is correct. (${message
        .split("\n")[0]
        .slice(0, 180)})`,
    );
  }
  await fs.rm(path.join(destination, ".git"), { recursive: true, force: true });
  const stats = await countFiles(destination);
  return { ...stats, skipped: 0 };
}

async function countFiles(root: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredEntry(`${entry.name}/`)) continue;
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(full);
          files += 1;
          bytes += stat.size;
        } catch {
          // Ignore files that disappear during ingestion.
        }
      }
    }
  }
  await walk(root);
  return { files, bytes };
}

export async function copySampleRepository(destination: string): Promise<IngestStats> {
  const source = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "benchmarks",
    "vulnerable-app",
  );
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.cp(source, destination, {
    recursive: true,
    filter: (sourcePath) => {
      const rel = path.relative(source, sourcePath).split(path.sep).join("/");
      return !ignoredEntry(rel);
    },
  });
  const stats = await countFiles(destination);
  return { ...stats, skipped: 0 };
}

export async function assertSourceDirectory(sourcePath: string): Promise<void> {
  const stat = await fs.stat(sourcePath);
  if (!stat.isDirectory()) throw new Error("Scan source is not a directory");
  const entries = await fs.readdir(sourcePath);
  if (entries.length === 0) throw new Error("Scan source directory is empty");
}

export async function purgeSource(sourcePath: string): Promise<void> {
  const resolved = path.resolve(sourcePath);
  if (!resolved.startsWith(`${SOURCE_ROOT}${path.sep}`)) {
    throw new Error("Refusing to delete a path outside the managed source root");
  }
  await fs.rm(resolved, { recursive: true, force: true });
}

export { SOURCE_ROOT };
