const RULE_CWE: Record<string, string[]> = {
  "AI-SQL-001": ["CWE-89"],
  "AI-AUTH-001": ["CWE-862"],
  "AI-CRED-001": ["CWE-798"],
  "AI-CORS-001": ["CWE-942"],
  "AI-JWT-001": ["CWE-321", "CWE-347"],
  "AI-RAND-001": ["CWE-338"],
  "AI-HASH-001": ["CWE-916", "CWE-256"],
  "AI-EVAL-001": ["CWE-95"],
  "AI-UPLOAD-001": ["CWE-22"],
  "AI-SSRF-001": ["CWE-918"],
  "AI-MASS-001": ["CWE-915"],
  "AI-RATE-001": ["CWE-307"],
  "AI-DEBUG-001": ["CWE-209"],
  "AI-RLS-001": ["CWE-862"],
  "AI-TLS-001": ["CWE-295"],
  "AI-IAM-001": ["CWE-732"],
  "AI-XSS-001": ["CWE-79"],
  "AI-REDIR-001": ["CWE-601"],
  "MCP-AUTH-001": ["CWE-306"],
  "MCP-PERM-001": ["CWE-250"],
  "MCP-CMD-001": ["CWE-78"],
  "SEC-AWS-001": ["CWE-798"],
  "SEC-STRIPE-001": ["CWE-798"],
  "SEC-GITHUB-001": ["CWE-798"],
  "SEC-PRIVATEKEY-001": ["CWE-321"],
  "SEC-GENERIC-001": ["CWE-798"],
  "SEC-ENV-001": ["CWE-798"],
};

export function cweForRule(ruleId: string): string[] {
  return RULE_CWE[ruleId] ?? [];
}

export function hasCweMapping(ruleId: string): boolean {
  return Object.hasOwn(RULE_CWE, ruleId) && RULE_CWE[ruleId]!.length > 0;
}
