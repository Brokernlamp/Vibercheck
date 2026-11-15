const SENSITIVE_NAME =
  "secret|token|passwd|password|api[_-]?key|access[_-]?key|private[_-]?key|credential|database_url|dsn|client[_-]?secret";

const KNOWN_TOKENS: Array<[RegExp, string]> = [
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, "[REDACTED_STRIPE_KEY]"],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bSG\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_SENDGRID_KEY]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED_SLACK_TOKEN]"],
  [/\bAIza[0-9A-Za-z_-]{30,}\b/g, "[REDACTED_GOOGLE_KEY]"],
  [
    /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----)[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    "$1\n[REDACTED_PRIVATE_KEY]",
  ],
  [
    /\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/@]+:)([^@\s/]+)(@)/gi,
    "$1[REDACTED]$3",
  ],
];

/**
 * Findings are rendered in analyst and client reports. Sanitize them centrally
 * so a context line cannot leak a neighboring secret even when the matched rule
 * is not a secrets detector.
 */
export function redactSnippetText(input: string): string {
  let value = input;
  for (const [pattern, replacement] of KNOWN_TOKENS) {
    value = value.replace(pattern, replacement);
  }

  // KEY=value / PASSWORD: "value" / app.config["SECRET_KEY"] = "value"
  value = value.replace(
    new RegExp(
      `^(\\s*(?:const|let|var|export\\s+const)?\\s*[A-Za-z0-9_.\\-\\[\\]"']*(?:${SENSITIVE_NAME})[A-Za-z0-9_.\\-\\[\\]"']*)\\s*([:=])\\s*(["'\`])([^"'\`\\n]{4,})\\3`,
      "gim",
    ),
    "$1$2$3[REDACTED]$3",
  );

  // process.env.SECRET || "fallback"
  value = value.replace(
    new RegExp(
      `([A-Za-z0-9_.\\[\\]"']*(?:${SENSITIVE_NAME})[A-Za-z0-9_.\\[\\]"']*\\s*(?:\\|\\||\\?\\?)\\s*)(["'\`])([^"'\`\\n]{3,})\\2`,
      "gi",
    ),
    "$1$2[REDACTED]$2",
  );

  // .env-style unquoted values
  value = value.replace(
    /^([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|DATABASE_URL|DSN)[A-Z0-9_]*)=(.+)$/gim,
    (line, key: string, raw: string) => {
      if (!raw.trim() || raw.trim() === "[REDACTED]") return line;
      return `${key}=[REDACTED]`;
    },
  );

  return value;
}
