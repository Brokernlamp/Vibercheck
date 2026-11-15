import { createHash } from "node:crypto";
import type { Rule, RuleMatch } from "./types";
import { lineAt, snippetAround } from "./types";
import { redactSnippetText } from "./redact";

const CODE_AND_CONFIG = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".go",
  ".java", ".kt", ".cs", ".swift", ".sh", ".bash", ".zsh", ".yml", ".yaml",
  ".json", ".toml", ".ini", ".conf", ".properties", ".xml", ".tf", ".sql",
  ".env", ".txt",
]);

const SENSITIVE_FILE =
  /^(?:\.env(?:\.[\w-]+)?|\.npmrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519|credentials|secrets\.(?:json|ya?ml))$/i;

const PLACEHOLDER =
  /(?:process\.env|import\.meta|your[_-]|example|changeme|placeholder|xxxx|dummy|sample|replace[_-]?me|<[^>]+>|\$\{|^\s*$)/i;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function redactSnippet(
  lines: string[],
  line: number,
  secret: string | undefined,
): string {
  let snippet = snippetAround(lines, line, line);
  if (secret) snippet = snippet.split(secret).join("[REDACTED]");
  return redactSnippetText(snippet);
}

function appliesToSecrets(ctx: { path: string; ext: string }): boolean {
  const base = ctx.path.split("/").pop() ?? "";
  if (SENSITIVE_FILE.test(base)) return true;
  if (base === "Dockerfile" || base.startsWith("docker-compose")) return true;
  return CODE_AND_CONFIG.has(ctx.ext);
}

export const secretRules: Rule[] = [
  {
    id: "SEC-AWS-001",
    title: "AWS access key committed to source",
    severity: "CRITICAL",
    confidence: 98,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "An AWS access key identifier is present in the repository. Anyone with repository access can attempt to use it, and it may already be in clones, CI logs, or build artifacts.",
    remediation:
      "Revoke the key in IAM immediately, rotate any dependent credentials, purge it from git history, and move the replacement to a secret manager or CI secret store.",
    appliesTo: appliesToSecrets,
    find: (ctx) => {
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g)) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const key = match[0];
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: hash(key),
          snippet: redactSnippet(ctx.lines, line, key),
        });
      }
      return matches;
    },
  },
  {
    id: "SEC-STRIPE-001",
    title: "Stripe secret key committed to source",
    severity: "CRITICAL",
    confidence: 98,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "A Stripe secret key is committed. A live key permits charges, refunds, customer access, and payout changes; a test key still indicates unsafe secret handling.",
    remediation:
      "Roll the key in the Stripe dashboard, update the deployed secret, purge the key from git history, and restrict keys by environment and least privilege.",
    appliesTo: appliesToSecrets,
    find: (ctx) => {
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g)) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const key = match[0];
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: hash(key),
          snippet: redactSnippet(ctx.lines, line, key),
          severity: key.includes("_test_") ? "HIGH" : "CRITICAL",
          title: key.includes("_test_")
            ? "Stripe test secret key committed to source"
            : "Stripe live secret key committed to source",
        });
      }
      return matches;
    },
  },
  {
    id: "SEC-GITHUB-001",
    title: "GitHub token committed to source",
    severity: "CRITICAL",
    confidence: 97,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "A GitHub personal access token or app token is present in the repository. Depending on scopes it can read private code, modify repositories, or act as the app installation.",
    remediation:
      "Revoke the token on GitHub, replace it with a short-lived, least-privilege token stored in CI secrets, and scan the full git history for other copies.",
    appliesTo: appliesToSecrets,
    find: (ctx) => {
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(
        /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g,
      )) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        const token = match[0];
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: hash(token),
          snippet: redactSnippet(ctx.lines, line, token),
        });
      }
      return matches;
    },
  },
  {
    id: "SEC-PRIVATEKEY-001",
    title: "Private key committed to source",
    severity: "CRITICAL",
    confidence: 96,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "A private key block is present in the repository. If it is still trusted, anyone with the repository can impersonate the service or decrypt protected material.",
    remediation:
      "Revoke and reissue the key pair, purge the key from history, store the new key in a secret manager, and add a pre-commit secret scan to prevent recurrence.",
    appliesTo: (ctx) => true,
    find: (ctx) => {
      const pattern =
        /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]{0,20000}?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g;
      const matches: RuleMatch[] = [];
      for (const match of ctx.content.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: hash(match[0]),
          snippet: "-----BEGIN PRIVATE KEY----- [REDACTED]",
        });
      }
      return matches;
    },
  },
  {
    id: "SEC-GENERIC-001",
    title: "Hardcoded credential or API secret",
    severity: "HIGH",
    confidence: 76,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "A secret-looking variable is assigned a literal value. This is one of the most common failure modes in AI-assisted commits, because generated examples often use real-looking keys.",
    remediation:
      "Move the value to an environment variable or secret manager, rotate it if it was ever real, and add secret scanning to pre-commit and CI.",
    appliesTo: (ctx) => appliesToSecrets(ctx) && !/^\.env/.test(ctx.path.split("/").pop() ?? ""),
    find: (ctx) => {
      const matches: RuleMatch[] = [];
      const pattern =
        /\b([A-Za-z0-9_.-]*(?:api[_-]?key|apikey|secret|token|passwd|password|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*)\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/gi;
      for (const match of ctx.content.matchAll(pattern)) {
        if (match.index === undefined) continue;
        const value = match[2];
        if (!value || PLACEHOLDER.test(value)) continue;
        if (/^(?:true|false|null|undefined|\d+)$/i.test(value)) continue;
        const line = lineAt(ctx.content, match.index);
        matches.push({
          lineStart: line,
          lineEnd: line,
          evidence: hash(`${match[1]}:${value}`),
          snippet: redactSnippet(ctx.lines, line, value),
          title: `Hardcoded credential: ${match[1]}`,
          confidence: /(?:sk_|AKIA|ghp_|private|jwt|stripe|aws)/i.test(value) ? 90 : 74,
        });
        if (matches.length >= 10) break;
      }
      return matches;
    },
  },
  {
    id: "SEC-ENV-001",
    title: "Secrets committed in an environment file",
    severity: "HIGH",
    confidence: 92,
    source: "SECRET",
    owasp: "A02",
    category: "Exposed credential",
    description:
      "An environment file in the repository contains a populated secret. Environment files are frequently included in AI-generated project scaffolds and forgotten before the first commit.",
    remediation:
      "Remove the file from version control, add it to .gitignore, rotate every exposed value, and commit a redacted .env.example instead. Purge the file from git history if it was pushed.",
    appliesTo: (ctx) => {
      const base = ctx.path.split("/").pop() ?? "";
      return /^\.env(?:\.[\w-]+)?$/.test(base) && !/\.(?:example|sample|template)$/.test(base);
    },
    find: (ctx) => {
      const matches: RuleMatch[] = [];
      const sensitiveKey =
        /(?:SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|API_?KEY|ACCESS_?KEY|STRIPE|AWS|DATABASE_URL|CONNECTION_STRING|SENDGRID|OPENAI|ANTHROPIC|GITHUB|SLACK|JWT)/i;
      ctx.lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return;
        const parsed = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
        if (!parsed) return;
        const [, key, rawValue] = parsed;
        const value = rawValue.replace(/^["']|["']$/g, "").trim();
        if (!sensitiveKey.test(key) || value.length < 6) return;
        if (PLACEHOLDER.test(value)) return;
        matches.push({
          lineStart: index + 1,
          lineEnd: index + 1,
          evidence: hash(`${key}:${value}`),
          snippet: `${key}=[REDACTED]`,
          title: `Committed environment secret: ${key}`,
          severity: /(?:SECRET|PRIVATE|STRIPE|AWS|OPENAI|ANTHROPIC)/i.test(key)
            ? "CRITICAL"
            : "HIGH",
          confidence: 94,
        });
      });
      return matches.slice(0, 20);
    },
  },
];

export const secretRuleMap = new Map(secretRules.map((rule) => [rule.id, rule]));
