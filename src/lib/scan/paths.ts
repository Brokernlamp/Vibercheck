import { SEVERITY_ORDER, type Severity } from "../domain";

/**
 * Where a file sits in the repository decides how much a heuristic finding in
 * it should count. Tests, examples, docs and vendored code are scanned (never
 * silently dropped) but their findings are reported with reduced confidence and
 * a lower severity ceiling, because a route without an auth guard in
 * `examples/` is usually the point of the example.
 */
export type PathKind = "production" | "test" | "example" | "docs" | "vendor" | "generated";

export interface PathPrecision {
  /** Multiplier applied to a heuristic rule's confidence. */
  confidenceFactor: number;
  /** Severity is never reported above this ceiling for this kind of file. */
  severityCeiling: Severity | null;
  /** Short label shown to analysts. */
  label: string;
  /** Why the finding was down-weighted, for analyst context. */
  reason: string;
}

export const PATH_PRECISION: Record<PathKind, PathPrecision> = {
  production: {
    confidenceFactor: 1,
    severityCeiling: null,
    label: "Application code",
    reason: "Ships to users.",
  },
  test: {
    confidenceFactor: 0.55,
    severityCeiling: "MEDIUM",
    label: "Test fixture",
    reason: "Test and fixture code is usually not deployed.",
  },
  example: {
    confidenceFactor: 0.45,
    severityCeiling: "MEDIUM",
    label: "Example",
    reason: "Sample code is illustrative and normally excluded from deploys.",
  },
  docs: {
    confidenceFactor: 0.4,
    severityCeiling: "LOW",
    label: "Documentation",
    reason: "Documentation is not executable in production.",
  },
  vendor: {
    confidenceFactor: 0.3,
    severityCeiling: "LOW",
    label: "Vendored",
    reason: "Third-party code; report the upgrade, not the implementation detail.",
  },
  generated: {
    confidenceFactor: 0.5,
    severityCeiling: "LOW",
    label: "Generated",
    reason: "Generated output; fix the generator or its templates.",
  },
};

const TEST_DIR = /^(?:tests?|__tests__|__mocks__|__snapshots__|specs?|e2e|cypress|playwright|testdata|test-data|fixtures?|mocks?|benchmarks?|perf)$/i;
const EXAMPLE_DIR = /^(?:examples?|samples?|demos?|demo|playground|sandbox|cookbook|tutorials?|starters?|boilerplates?|templates?|stories)$/i;
const DOC_DIR = /^(?:docs?|documentation|website|site|guides?|manual|wiki)$/i;
const VENDOR_DIR = /^(?:vendor|vendors|third[_-]?party|external|bower_components|node_modules|static|assets|public|help|www|htdocs|webroot)$/i;
const GENERATED_DIR = /^(?:generated|__generated__|gen|codegen|dist|build|out|coverage|\.next)$/i;

const TEST_FILE =
  /(?:\.(?:test|spec|e2e|cy)\.[cm]?[jt]sx?$|_(?:test|spec)\.(?:py|rb|go|php)$|^test_.*\.py$|^conftest\.py$|\.stories\.[cm]?[jt]sx?$)/i;
const DOC_FILE = /\.(?:md|mdx|markdown|rst|adoc|txt)$/i;
const GENERATED_FILE = /(?:\.min\.(?:js|css)$|\.bundle\.js$|\.generated\.[a-z]+$|\.g\.dart$|_pb2\.py$|\.pb\.go$|\.designer\.cs$)/i;

/**
 * Classifies a repository-relative POSIX path. The most specific match wins:
 * a `/docs/examples/` path is an example, and `vendor/` beats everything else
 * because third-party code is never the client's own defect.
 */
export function classifyPath(filePath: string): PathKind {
  const segments = filePath
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.length === 0) return "production";

  const directories = segments.slice(0, -1);
  const fileName = segments[segments.length - 1] ?? "";

  if (directories.some((segment) => VENDOR_DIR.test(segment))) return "vendor";
  if (GENERATED_FILE.test(fileName) || directories.some((segment) => GENERATED_DIR.test(segment))) {
    return "generated";
  }
  if (TEST_FILE.test(fileName) || directories.some((segment) => TEST_DIR.test(segment))) {
    return "test";
  }
  if (directories.some((segment) => EXAMPLE_DIR.test(segment))) return "example";
  if (DOC_FILE.test(fileName) || directories.some((segment) => DOC_DIR.test(segment))) {
    return "docs";
  }
  return "production";
}

export function capSeverity(severity: Severity, ceiling: Severity | null): Severity {
  if (!ceiling) return severity;
  const rank = SEVERITY_ORDER.indexOf(severity);
  const ceilingRank = SEVERITY_ORDER.indexOf(ceiling);
  if (rank < 0 || ceilingRank < 0) return severity;
  // Lower rank is more severe, so anything above the ceiling is clamped.
  return rank < ceilingRank ? ceiling : severity;
}

export interface TunedFinding {
  confidence: number;
  severity: Severity;
  kind: PathKind;
  /** True when the path or a rule heuristic reduced the finding. */
  demoted: boolean;
}

/**
 * Applies the precision profile for a file path to a heuristic (CUSTOM) finding.
 * Secret, dependency and license findings are evidence-based and are never
 * down-weighted by location: a live key in `examples/` is still a live key.
 */
export function tuneHeuristicFinding({
  severity,
  confidence,
  filePath,
}: {
  severity: Severity;
  confidence: number;
  filePath: string;
}): TunedFinding {
  const kind = classifyPath(filePath);
  const profile = PATH_PRECISION[kind];
  const capped = capSeverity(severity, profile.severityCeiling);
  const scaled = Math.round(
    Math.min(100, Math.max(0, confidence)) * profile.confidenceFactor,
  );
  return {
    confidence: Math.min(100, Math.max(0, scaled)),
    severity: capped,
    kind,
    demoted: kind !== "production" || capped !== severity,
  };
}
