import type { FileContext, Rule, RuleMatch } from "./types";
import { lineAt, lineTextAt, snippetAround } from "./types";

const JS_TS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const PYTHON = new Set([".py"]);
const CODE = new Set([...JS_TS, ...PYTHON, ".rb", ".php", ".go", ".java", ".kt"]);
const CONFIG = new Set([".json", ".yaml", ".yml", ".toml", ".tf", ".env"]);
const MARKUP = new Set([...JS_TS, ".html", ".vue", ".svelte"]);

const AUTH_HINT =
  /\b(?:requireAuth|authenticate|isAuthenticated|requireUser|verifyToken|authMiddleware|ensureAuth|withAuth|requireSession|authorize|passport\.authenticate)\b/i;
const PUBLIC_ROUTE =
  /^(?:\/(?:health|status|login|signin|signup|register|auth|public|webhooks?|callback|docs|pricing|favicon))/i;
const SENSITIVE_ROUTE =
  /(?:admin|users?|accounts?|billing|payments?|orders?|notes?|projects?|settings|internal|private|messages?|documents?|files?|customers?|profiles?)/i;
const SAFE_PATH_HANDLING = /\b(?:basename|randomUUID|uuid|sanitize|safeName|path\.resolve\s*\(\s*uploadDir)/i;
// A route registration is only meaningful where a web framework is in play. A
// framework's own source (or a helper that mimics `app.get`) is not an
// unauthenticated endpoint, so matches there get a lower confidence.
const FRAMEWORK_HINT =
  /\b(?:express|fastify|koa|hono|@nestjs|restify|polka|micro|next\/server|next\/navigation|elysia)\b/i;

function collect(
  ctx: FileContext,
  pattern: RegExp,
  build: (match: RegExpExecArray, line: number) => RuleMatch,
  limit = 12,
): RuleMatch[] {
  const results: RuleMatch[] = [];
  for (const match of ctx.content.matchAll(pattern)) {
    if (match.index === undefined) continue;
    results.push(build(match, lineAt(ctx.content, match.index)));
    if (results.length >= limit) break;
  }
  return results;
}

function evidence(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 280);
}

function dedupeByLine(matches: RuleMatch[]): RuleMatch[] {
  const seen = new Set<number>();
  return matches.filter((match) => {
    if (seen.has(match.lineStart)) return false;
    seen.add(match.lineStart);
    return true;
  });
}

function fileLevelRule(
  rule: Omit<Rule, "find">,
  finder: (ctx: FileContext) => RuleMatch[],
): Rule {
  return { ...rule, find: finder };
}

export const customRules: Rule[] = [
  fileLevelRule(
    {
      id: "AI-SQL-001",
      title: "SQL query built from string construction",
      severity: "CRITICAL",
      confidence: 88,
      source: "CUSTOM",
      owasp: "A05",
      category: "Injection",
      description:
        "A SQL statement is assembled from interpolated or concatenated values. LLM-generated CRUD code frequently produces this pattern, allowing user input to change query structure and enabling SQL injection.",
      remediation:
        "Use bound parameters or a query builder. For example, replace concatenation with `WHERE id = $1` and pass values in a separate parameters array. Never interpolate request data into SQL text.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext) && ctx.ext !== ".sql") return [];
      const matches: RuleMatch[] = [];
      const patterns = [
        /(?:select|insert\s+into|update|delete\s+from)\b[^`\n]{0,260}\$\{/gi,
        /\b(?:select|insert|update|delete|from|where)\b[^\n;]{0,260}["'`]\s*\+\s*(?:req\.|request\.|params\.|query\.|body\.|\w*(?:id|name|email|input|value)\b)/gi,
        /\bf["']\s*(?:select|insert|update|delete)\b[^"'\n]{0,260}\{/gi,
        /\b(?:select|insert|update|delete)\b[^"'\n]{0,260}["']\s*%\s*(?:\(|\w)/gi,
        /\b(?:select|insert|update|delete)\b[^"'\n]{0,260}["']\s*\.format\s*\(/gi,
      ];
      for (const pattern of patterns) {
        matches.push(
          ...collect(ctx, pattern, (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(lineTextAt(ctx.lines, line)),
            snippet: snippetAround(ctx.lines, line, line),
          })),
        );
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-AUTH-001",
      title: "CRUD endpoint has no authorization check",
      severity: "HIGH",
      confidence: 46,
      source: "CUSTOM",
      owasp: "A01",
      category: "Broken access control",
      description:
        "A generated route handler appears to expose a sensitive operation without an authentication or authorization guard. Analysts should confirm whether middleware elsewhere in the app protects this route.",
      remediation:
        "Require an authenticated session and an explicit object-level permission check on the route. Prefer a route-level guard so the check cannot be forgotten when new handlers are generated.",
    },
    (ctx) => {
      if (!JS_TS.has(ctx.ext)) return [];
      if (
        /(?:app|router|server|route)\.use\s*\([^)]*(?:requireAuth|authenticate|isAuthenticated|authMiddleware|requireUser|verifyToken|requireSession)/i.test(
          ctx.content,
        )
      ) {
        return [];
      }
      const routePattern =
        /(?:app|router|server|route)\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2\s*,([^\n]*)/gi;
      const frameworkFactor = FRAMEWORK_HINT.test(ctx.content) ? 1 : 0.65;
      const results: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(routePattern)) {
        if (match.index === undefined) continue;
        const method = match[1].toLowerCase();
        const routePath = match[3];
        if (PUBLIC_ROUTE.test(routePath)) continue;
        if (method === "get" && !SENSITIVE_ROUTE.test(routePath)) continue;
        const tail = ctx.content.slice(match.index, match.index + 1800);
        if (AUTH_HINT.test(tail)) continue;
        const line = lineAt(ctx.content, match.index);
        // Route registrations inside doc comments and commented-out code are
        // documentation, not endpoints (framework README examples rely on this).
        if (/^(?:\*|\/\/|\/\*|#)/.test(lineTextAt(ctx.lines, line))) continue;
        results.push({
          lineStart: line,
          lineEnd: line,
          evidence: `${method.toUpperCase()} ${routePath}`,
          snippet: snippetAround(ctx.lines, line, line),
          title: `Authorization missing on ${method.toUpperCase()} ${routePath}`,
          confidence: Math.round((method === "get" ? 50 : 60) * frameworkFactor),
        });
        if (results.length >= 10) break;
      }
      return results;
    },
  ),
  fileLevelRule(
    {
      id: "AI-CRED-001",
      title: "Hardcoded fallback credential",
      severity: "HIGH",
      confidence: 86,
      source: "CUSTOM",
      owasp: "A07",
      category: "Authentication failures",
      description:
        "A sensitive setting falls back to a literal default when an environment variable is missing. Generated deployment code often ships with working default passwords or signing keys.",
      remediation:
        "Fail closed when required secrets are absent. Remove the fallback and validate configuration at startup so a missing secret stops the app instead of silently using a known default.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext) && !CONFIG.has(ctx.ext)) return [];
      const patterns = [
        /(?:password|passwd|pwd|secret|token|api[_-]?key|private[_-]?key|admin[_-]?\w*)\s*(?:\|\||\?\?|or)\s*["'`]([^"'`\n]{3,})["'`]/gi,
        /(?:os\.environ\.get|os\.getenv|getenv)\s*\(\s*["'][^"']*(?:secret|password|token|key)[^"']*["']\s*,\s*["'][^"']{3,}["']\s*\)/gi,
      ];
      return dedupeByLine(
        patterns.flatMap((pattern) =>
          collect(ctx, pattern, (match, line) => {
            const raw = match[0];
            const literal = match[1];
            return {
              lineStart: line,
              lineEnd: line,
              evidence: evidence(raw),
              snippet: literal
                ? snippetAround(ctx.lines, line, line).replace(literal, "[REDACTED]")
                : snippetAround(ctx.lines, line, line),
            };
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "AI-CORS-001",
      title: "Overly permissive cross-origin policy",
      severity: "HIGH",
      confidence: 84,
      source: "CUSTOM",
      owasp: "A02",
      category: "Security misconfiguration",
      description:
        "CORS accepts every origin, and in some cases does so while allowing credentials. Any website can then make authenticated requests to the API on behalf of a signed-in user.",
      remediation:
        "Allowlist trusted front-end origins and reflect only exact matches. Do not combine a wildcard origin with credentials; browsers reject it, and permissive proxies can make it exploitable.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const results: RuleMatch[] = [];
      const credentials = /credentials\s*:\s*true/i.test(ctx.content);
      for (const match of ctx.content.matchAll(
        /origin\s*:\s*["'`]\*["'`][^\n]*/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        results.push({
          lineStart: line,
          lineEnd: line,
          evidence: "cors origin wildcard",
          snippet: snippetAround(ctx.lines, line, line),
          severity: credentials ? "HIGH" : "MEDIUM",
          confidence: credentials ? 90 : 70,
        });
      }
      for (const match of ctx.content.matchAll(/\bcors\s*\(\s*\)/gi)) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        results.push({
          lineStart: line,
          lineEnd: line,
          evidence: "cors defaults",
          snippet: snippetAround(ctx.lines, line, line),
          severity: "MEDIUM",
          confidence: 55,
        });
      }
      return dedupeByLine(results);
    },
  ),
  fileLevelRule(
    {
      id: "AI-JWT-001",
      title: "JWT signed or verified with a hardcoded secret",
      severity: "HIGH",
      confidence: 86,
      source: "CUSTOM",
      owasp: "A07",
      category: "Cryptographic failures",
      description:
        "A JWT operation uses a literal signing secret or explicitly weakens verification. A committed signing key lets anyone mint valid tokens for any user.",
      remediation:
        "Load the signing key from a secret manager, require a strong algorithm, and never disable expiration. Rotate the exposed key and invalidate existing sessions.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /\bjwt\.(?:sign|verify)\s*\([^)\n]{0,200}["'`]([A-Za-z0-9_\-.]{8,})["'`]/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const secret = match[1];
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)).replace(secret, "[REDACTED]"),
          snippet: snippetAround(ctx.lines, line, line).replace(secret, "[REDACTED]"),
        });
      }
      for (const match of ctx.content.matchAll(
        /(?:\bignoreExpiration\s*:\s*true|\balgorithms\s*:\s*\[\s*["'`]none["'`]\s*\])/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
          title: "JWT verification is weakened",
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-RAND-001",
      title: "Security token uses non-cryptographic randomness",
      severity: "MEDIUM",
      confidence: 78,
      source: "CUSTOM",
      owasp: "A04",
      category: "Cryptographic failures",
      description:
        "Math.random() or random.random() is used in a token, reset, OTP, or session context. These generators are predictable and unsuitable for security-sensitive values.",
      remediation:
        "Generate tokens with a cryptographically secure source (crypto.randomBytes, crypto.randomUUID, or secrets.token_urlsafe) and store only a hash of the token server-side.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(/\b(?:Math\.random|random\.random)\s*\(\)/g)) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const nearby = ctx.lines
          .slice(Math.max(0, line - 3), Math.min(ctx.lines.length, line + 2))
          .join("\n");
        if (!/(?:token|reset|otp|nonce|session|csrf|verification|invite|secret)/i.test(nearby)) {
          continue;
        }
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(nearby),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-HASH-001",
      title: "Weak password hashing or plaintext comparison",
      severity: "HIGH",
      confidence: 82,
      source: "CUSTOM",
      owasp: "A04",
      category: "Cryptographic failures",
      description:
        "Password material is handled with a fast hash such as MD5/SHA-1 or compared directly. Either pattern makes credential recovery or credential stuffing substantially easier after a leak.",
      remediation:
        "Use a memory-hard password hash (Argon2id, scrypt, or bcrypt) with a unique salt per user. Compare hashes with a constant-time function; never compare or store plaintext passwords.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:createHash|hashlib\.(?:md5|sha1))\s*\(\s*["'`](?:md5|sha1)["'`]/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const nearby = ctx.lines
          .slice(Math.max(0, line - 4), Math.min(ctx.lines.length, line + 4))
          .join("\n");
        if (!/password|passwd|credential/i.test(nearby) && !/auth/i.test(ctx.path)) continue;
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(nearby),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      matches.push(
        ...collect(
          ctx,
          /(?:password|passwd)\s*===?\s*(?:req\.body|request\.json|request\.form|body\.)/gi,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(match[0]),
            snippet: snippetAround(ctx.lines, line, line),
            title: "Password compared in plaintext",
          }),
        ),
      );
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-EVAL-001",
      title: "Dynamic code execution",
      severity: "CRITICAL",
      confidence: 82,
      source: "CUSTOM",
      owasp: "A05",
      category: "Injection",
      description:
        "The code evaluates a string as executable code. If any part of that string is influenced by a request, an attacker can run arbitrary code in the application process.",
      remediation:
        "Remove eval/new Function. Use an explicit parser or a fixed command map. If dynamic behaviour is unavoidable, execute it in a locked-down sandbox with no secrets and no network access.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      return dedupeByLine(
        collect(
          ctx,
          /(?:\beval\s*\(|new\s+Function\s*\(|vm\.runIn(?:New|This)Context\s*\(|\bexec\s*\(\s*(?:req\.|request\.|input\())/g,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(lineTextAt(ctx.lines, line)),
            snippet: snippetAround(ctx.lines, line, line),
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "AI-UPLOAD-001",
      title: "Upload filename used without path sanitization",
      severity: "HIGH",
      confidence: 80,
      source: "CUSTOM",
      owasp: "A01",
      category: "Path traversal",
      description:
        "A user-supplied upload filename is joined into a filesystem path. A name such as ../../server.js can overwrite files outside the upload directory.",
      remediation:
        "Ignore the client filename for storage. Generate a random identifier, keep only a validated extension, resolve the final path, and verify it remains inside the upload root.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:(?:path|os\.path)\.join|writeFile(?:Sync)?|createWriteStream|unlink(?:Sync)?)\s*\([^)\n]{0,240}(?:originalname|filename|upload\.filename)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const text = lineTextAt(ctx.lines, line);
        if (SAFE_PATH_HANDLING.test(text)) continue;
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(text),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-SSRF-001",
      title: "Server-side request to a user-controlled URL",
      severity: "MEDIUM",
      confidence: 74,
      source: "CUSTOM",
      owasp: "A01",
      category: "Server-side request forgery",
      description:
        "The server fetches a URL taken directly from request data. That may let an attacker reach internal metadata services, admin panels, or private network ranges.",
      remediation:
        "Validate the URL against an allowlist of schemes and hosts, resolve the hostname and reject private/link-local addresses, disable redirects, and enforce a short timeout and response-size limit.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:fetch|axios\.(?:get|post|put)|got|needle|requests?\.(?:get|post)|urlopen)\s*\(\s*(?:req\.(?:query|body|params)|request\.(?:args|form|json|values)|request\.get_json\(\))/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-MASS-001",
      title: "Request body passed directly into a model write",
      severity: "MEDIUM",
      confidence: 76,
      source: "CUSTOM",
      owasp: "A01",
      category: "Mass assignment",
      description:
        "The whole request body is written to a model. An attacker can add fields the UI never exposes, such as role, isAdmin, or ownerId.",
      remediation:
        "Use an explicit allowlist schema (for example Zod or a DTO) and assign only permitted fields. Mark privileged fields server-controlled.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:\b[A-Z]\w*\.(?:create|update|insert|save)|Object\.assign)\s*\(\s*(?:req\.body|request\.json|request\.get_json\(\)|\*\*request\.json)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      for (const match of ctx.content.matchAll(
        /\b[A-Z]\w*\s*\(\s*\*\*\s*request\.(?:json|form|get_json\(\))/g,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-RATE-001",
      title: "Authentication endpoint lacks rate limiting",
      severity: "MEDIUM",
      confidence: 62,
      source: "CUSTOM",
      owasp: "A07",
      category: "Authentication failures",
      description:
        "A login, signup, or password-reset endpoint has no visible rate limiter. This allows unlimited credential guessing and reset-token brute force.",
      remediation:
        "Add per-account and per-IP rate limiting with exponential backoff, log failures, and alert on sustained attempts. Apply it before the credential check executes.",
    },
    (ctx) => {
      if (!JS_TS.has(ctx.ext) && !PYTHON.has(ctx.ext)) return [];
      if (/rate[-_]?limit|slowDown|throttle|limiter|@limiter/i.test(ctx.content)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:app|router|blueprint)\.(?:post|route)\s*\(\s*["'`][^"'`]*(?:login|signin|signup|register|reset-password|forgot-password)[^"'`]*["'`]/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: "auth route without rate limiter",
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return matches.slice(0, 2);
    },
  ),
  fileLevelRule(
    {
      id: "AI-DEBUG-001",
      title: "Debug mode or verbose error output enabled",
      severity: "MEDIUM",
      confidence: 78,
      source: "CUSTOM",
      owasp: "A02",
      category: "Security misconfiguration",
      description:
        "The application runs with debug enabled or returns internal stack traces. This exposes file paths, library versions, and sometimes secrets or query text.",
      remediation:
        "Disable debug and interactive error pages in every deployed environment. Return a generic error identifier to clients and log the details server-side.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext) && !CONFIG.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:app\.run\([^)]*debug\s*=\s*True|DEBUG\s*=\s*True|debug\s*:\s*true)/g,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
          confidence: 72,
        });
      }
      for (const match of ctx.content.matchAll(
        /res\.(?:status\([^)]*\)\.)?(?:json|send)\s*\([^)\n]*(?:err|error)\.(?:stack|message)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line),
          title: "Verbose error returned to client",
          confidence: 84,
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-RLS-001",
      title: "Database row-level security policy allows every row",
      severity: "CRITICAL",
      confidence: 88,
      source: "CUSTOM",
      owasp: "A01",
      category: "Broken access control",
      description:
        "A Supabase/Postgres policy uses `using (true)` or `with check (true)`. With RLS enabled this still permits every authenticated or anonymous user to read or write every row.",
      remediation:
        "Scope policies to the authenticated owner, for example `using (auth.uid() = user_id)` with a matching check clause. Review every policy for `for all` and public roles.",
    },
    (ctx) => {
      if (ctx.ext !== ".sql") return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /\b(?:using|with\s+check)\s*\(\s*true\s*\)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(lineTextAt(ctx.lines, line)),
          snippet: snippetAround(ctx.lines, line, line, 2),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-TLS-001",
      title: "TLS certificate verification disabled",
      severity: "MEDIUM",
      confidence: 92,
      source: "CUSTOM",
      owasp: "A04",
      category: "Cryptographic failures",
      description:
        "The client explicitly disables certificate validation. An attacker on the network path can impersonate the upstream service and read or alter traffic.",
      remediation:
        "Remove the insecure flag and validate certificates. If a private CA is required, install that CA explicitly instead of disabling verification globally.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext) && !CONFIG.has(ctx.ext)) return [];
      return dedupeByLine(
        collect(
          ctx,
          /(?:rejectUnauthorized\s*:\s*false|verify\s*=\s*False|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|InsecureSkipVerify\s*:\s*true|CERT_NONE)/gi,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(lineTextAt(ctx.lines, line)),
            snippet: snippetAround(ctx.lines, line, line),
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "AI-IAM-001",
      title: "Wildcard cloud permissions",
      severity: "HIGH",
      confidence: 86,
      source: "CUSTOM",
      owasp: "A02",
      category: "Security misconfiguration",
      description:
        "An infrastructure policy grants Action \"*\" on Resource \"*\". A leaked credential then has full control of the account or project.",
      remediation:
        "Replace wildcards with the specific actions and resource ARNs the workload needs. Use separate roles per service and add conditions where possible.",
    },
    (ctx) => {
      if (!CONFIG.has(ctx.ext)) return [];
      if (!/["']?(?:Resource|resources)["']?\s*[:=]\s*\[?\s*["']\*["']/i.test(ctx.content)) {
        return [];
      }
      return dedupeByLine(
        collect(
          ctx,
          /["']?(?:Action|actions)["']?\s*[:=]\s*\[?\s*["']\*["']/gi,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: "wildcard action and resource",
            snippet: snippetAround(ctx.lines, line, line, 2),
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "AI-XSS-001",
      title: "Unsanitized HTML rendered from application data",
      severity: "HIGH",
      confidence: 68,
      source: "CUSTOM",
      owasp: "A05",
      category: "Cross-site scripting",
      description:
        "The component renders raw HTML or writes to innerHTML. If the content includes user or model-generated data, injected markup can execute in a victim's browser.",
      remediation:
        "Render data as text. If HTML is required, sanitize it with a maintained allowlist sanitizer (DOMPurify) immediately before rendering, and add a strict Content-Security-Policy.",
    },
    (ctx) => {
      if (!MARKUP.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:dangerouslySetInnerHTML|v-html|\.innerHTML\s*=\s*)([^\n]*)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const text = lineTextAt(ctx.lines, line);
        if (/sanitize|DOMPurify/i.test(text)) continue;
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(text),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
  fileLevelRule(
    {
      id: "AI-REDIR-001",
      title: "Unvalidated redirect target",
      severity: "MEDIUM",
      confidence: 80,
      source: "CUSTOM",
      owasp: "A01",
      category: "Open redirect",
      description:
        "A redirect target comes straight from request data. Attackers can use the trusted domain to bounce users to a phishing site or to leak tokens through the Referer header.",
      remediation:
        "Accept only relative paths that start with a single slash, or validate against a fixed allowlist of hosts. Never redirect to an absolute URL supplied by the request.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      return dedupeByLine(
        collect(
          ctx,
          /(?:res\.redirect|redirect|history\.push)\s*\(\s*(?:req\.(?:query|body|params)|request\.(?:args|form|json))/gi,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(lineTextAt(ctx.lines, line)),
            snippet: snippetAround(ctx.lines, line, line),
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "MCP-AUTH-001",
      title: "MCP server exposes tools without authentication",
      severity: "HIGH",
      confidence: 60,
      source: "CUSTOM",
      owasp: "A07",
      category: "MCP security",
      description:
        "An HTTP-exposed Model Context Protocol server appears to have no authentication or caller verification. Any client that can reach the endpoint can invoke its tools.",
      remediation:
        "Require a verified bearer token or OAuth session on every MCP request, bind tool permissions to the caller's identity, and refuse to start in HTTP mode without an auth provider.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const isMcp =
        /@modelcontextprotocol\/sdk|from\s+mcp\.server|FastMCP|new\s+Server\s*\(/.test(
          ctx.content,
        );
      if (!isMcp) return [];
      const httpExposed =
        /StreamableHTTPServerTransport|SSEServerTransport|httpStream|transport\s*[:=]\s*["']http|FastMCP\s*\(/i.test(
          ctx.content,
        );
      const hasAuth =
        /\b(?:apiKey|api_key|authorization|bearer|verifyToken|verify_token|authenticate|requireAuth|HTTPBearer|OAuth)\b/i.test(
          ctx.content,
        );
      if (!httpExposed || hasAuth) return [];
      return [
        {
          lineStart: 1,
          lineEnd: Math.min(ctx.lines.length, 3),
          evidence: `mcp server without auth: ${ctx.path}`,
          snippet: ctx.lines.slice(0, 12).join("\n").slice(0, 1200),
        },
      ];
    },
  ),
  fileLevelRule(
    {
      id: "MCP-PERM-001",
      title: "MCP tool permissions are overly broad",
      severity: "HIGH",
      confidence: 82,
      source: "CUSTOM",
      owasp: "A01",
      category: "MCP security",
      description:
        "An MCP server grants wildcard tools, filesystem, or shell access. A prompt-injected agent can turn broad tool permissions into arbitrary actions on the host.",
      remediation:
        "Grant the minimum tool set per server and per caller. Separate shell and filesystem tools into a different trust boundary, require confirmation for destructive actions, and log every invocation.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext) && !CONFIG.has(ctx.ext)) return [];
      return dedupeByLine(
        collect(
          ctx,
          /(?:allowedTools\s*:\s*\[\s*["']\*["']|allowAll\s*:\s*true|permissions\s*:\s*\[[^\]]*["']\*["']|dangerously-skip-permissions|"defaultMode"\s*:\s*"bypassPermissions")/gi,
          (match, line) => ({
            lineStart: line,
            lineEnd: line,
            evidence: evidence(lineTextAt(ctx.lines, line)),
            snippet: snippetAround(ctx.lines, line, line),
          }),
        ),
      );
    },
  ),
  fileLevelRule(
    {
      id: "MCP-CMD-001",
      title: "MCP tool builds a shell command from tool input",
      severity: "CRITICAL",
      confidence: 84,
      source: "CUSTOM",
      owasp: "A05",
      category: "MCP security",
      description:
        "An MCP tool interpolates model-controlled arguments into a shell command or spawns with shell mode. A prompt-injected agent can execute arbitrary commands on the host.",
      remediation:
        "Never pass tool arguments through a shell. Map requests to fixed executables, pass arguments as an array with shell disabled, and validate/allowlist values before execution.",
    },
    (ctx) => {
      if (!CODE.has(ctx.ext)) return [];
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /(?:execSync|exec|spawnSync|spawn)\s*\([^)\n]{0,240}(?:\$\{|args\.|input\.|params\.|shell\s*:\s*true)/gi,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const text = lineTextAt(ctx.lines, line);
        if (/\bshell\s*:\s*false/i.test(text)) continue;
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: evidence(text),
          snippet: snippetAround(ctx.lines, line, line),
        });
      }
      return dedupeByLine(matches);
    },
  ),
];

export const customRuleMap = new Map(customRules.map((rule) => [rule.id, rule]));
