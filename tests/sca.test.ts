import { afterEach, describe, expect, it, vi } from "vitest";
import { collectDependencies, scanDependencies } from "../src/lib/scan/sca";
import { clearAdvisoryCache, lookupAdvisories } from "../src/lib/scan/osv";
import type { FileContext } from "../src/lib/scan/types";

function context(filePath: string, content: string): FileContext {
  return {
    path: filePath,
    content,
    lines: content.split("\n"),
    ext: filePath.slice(filePath.lastIndexOf(".")),
  };
}

const MANIFEST = JSON.stringify(
  {
    name: "app",
    dependencies: { lodash: "^4.17.0" },
    devDependencies: { vitest: "^1.0.0" },
  },
  null,
  2,
);

const LOCKFILE = JSON.stringify({
  name: "app",
  lockfileVersion: 3,
  packages: {
    "": { name: "app", dependencies: { lodash: "^4.17.0" } },
    "node_modules/lodash": { version: "4.17.15" },
    "node_modules/minimist": { version: "1.2.5", dev: true },
  },
});

describe("dependency inventory", () => {
  it("prefers exact lockfile versions over declared ranges", () => {
    const deps = collectDependencies([
      context("package.json", MANIFEST),
      context("package-lock.json", LOCKFILE),
    ]);
    const lodash = deps.find((dep) => dep.name === "lodash");
    expect(lodash?.version).toBe("4.17.15");
    expect(lodash?.locked).toBe(true);
    expect(lodash?.direct).toBe(true);
    // Transitive/dev package that the manifest never mentions.
    expect(deps.find((dep) => dep.name === "minimist")?.dev).toBe(true);
  });

  it("falls back to the declared range when there is no lockfile", () => {
    const deps = collectDependencies([context("package.json", MANIFEST)]);
    expect(deps.find((dep) => dep.name === "lodash")?.version).toBe("4.17.0");
    expect(deps.find((dep) => dep.name === "lodash")?.locked).toBe(false);
  });
});

const OSV_BATCH = {
  results: [
    { vulns: [{ id: "GHSA-aaaa-bbbb-cccc" }] },
    { vulns: [{ id: "GHSA-dddd-eeee-ffff" }] },
  ],
};

const OSV_DETAILS: Record<string, unknown> = {
  "GHSA-aaaa-bbbb-cccc": {
    id: "GHSA-aaaa-bbbb-cccc",
    summary: "Prototype pollution in lodash",
    aliases: ["CVE-2020-8203"],
    database_specific: { severity: "HIGH" },
    affected: [
      {
        package: { name: "lodash", ecosystem: "npm" },
        ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.19" }] }],
      },
    ],
  },
  "GHSA-dddd-eeee-ffff": {
    id: "GHSA-dddd-eeee-ffff",
    summary: "Prototype pollution in minimist",
    aliases: ["CVE-2021-44906"],
    database_specific: { severity: "CRITICAL" },
    affected: [
      {
        package: { name: "minimist", ecosystem: "npm" },
        ranges: [{ events: [{ introduced: "0" }, { fixed: "1.2.6" }] }],
      },
    ],
  },
};

function stubOsv() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.includes("querybatch")) {
      return new Response(JSON.stringify(OSV_BATCH), { status: 200 });
    }
    const id = decodeURIComponent(url.split("/vulns/")[1] ?? "");
    const detail = OSV_DETAILS[id];
    if (!detail) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(detail), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearAdvisoryCache();
});

describe("live OSV advisories", () => {
  it("maps OSV records to severity, CVE alias and fixed version", async () => {
    stubOsv();
    const result = await lookupAdvisories([
      { name: "lodash", version: "4.17.15", ecosystem: "npm" },
      { name: "minimist", version: "1.2.5", ecosystem: "npm" },
    ]);
    expect(result.failed).toBe(false);
    const lodash = result.advisories.get("npm:lodash@4.17.15") ?? [];
    expect(lodash).toHaveLength(1);
    expect(lodash[0]).toMatchObject({
      id: "GHSA-aaaa-bbbb-cccc",
      cve: "CVE-2020-8203",
      severity: "HIGH",
      fixed: "4.17.19",
    });
    const minimist = result.advisories.get("npm:minimist@1.2.5") ?? [];
    expect(minimist[0]?.severity).toBe("CRITICAL");
  });

  it("reports one finding per vulnerable package and names the fix", () => {
    const advisories = new Map([
      [
        "npm:lodash@4.17.15",
        [
          {
            id: "GHSA-aaaa-bbbb-cccc",
            cve: "CVE-2020-8203",
            severity: "HIGH" as const,
            summary: "Prototype pollution in lodash",
            fixed: "4.17.19",
          },
          {
            id: "GHSA-zzzz-yyyy-xxxx",
            cve: "CVE-2021-23337",
            severity: "CRITICAL" as const,
            summary: "Command injection in lodash template",
            fixed: "4.17.21",
          },
        ],
      ],
    ]);
    const findings = scanDependencies(
      [context("package.json", MANIFEST), context("package-lock.json", LOCKFILE)],
      { advisories },
    );
    const lodash = findings.filter((finding) => finding.title.includes("lodash"));
    expect(lodash).toHaveLength(1);
    expect(lodash[0]?.severity).toBe("CRITICAL");
    expect(lodash[0]?.title).toContain("2 advisories");
    expect(lodash[0]?.description).toContain("CVE-2020-8203");
    expect(lodash[0]?.remediation).toContain("4.17.21");
  });

  it("sends OSV's case-sensitive PyPI ecosystem identifier", async () => {
    const fetchMock = stubOsv();
    await lookupAdvisories([
      { name: "flask", version: "2.0.1", ecosystem: "pypi" },
    ]);
    const batchCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("querybatch"),
    );
    const body = JSON.parse(String(batchCall?.[1]?.body ?? "{}"));
    expect(body.queries[0].package).toEqual({ name: "flask", ecosystem: "PyPI" });
  });

  it("falls back cleanly when the feed is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream down", { status: 503 })),
    );
    const result = await lookupAdvisories([
      { name: "lodash", version: "4.17.15", ecosystem: "npm" },
    ]);
    expect(result.failed).toBe(true);
    expect(result.warnings[0]).toContain("Live advisory lookup failed");
  });
});
