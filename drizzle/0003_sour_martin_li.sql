ALTER TABLE "findings" ADD COLUMN "owasp_taxonomy" text DEFAULT 'OWASP Top 10:2025' NOT NULL;
UPDATE "findings"
SET "owasp" = CASE
  WHEN "rule_id" IN ('AI-SQL-001', 'AI-EVAL-001', 'AI-XSS-001', 'MCP-CMD-001') THEN 'A05'
  WHEN "rule_id" IN ('AI-AUTH-001', 'AI-UPLOAD-001', 'AI-SSRF-001', 'AI-MASS-001', 'AI-RLS-001', 'AI-REDIR-001', 'MCP-PERM-001') THEN 'A01'
  WHEN "rule_id" IN ('AI-CRED-001', 'AI-RATE-001', 'AI-JWT-001', 'MCP-AUTH-001') THEN 'A07'
  WHEN "rule_id" IN ('AI-CORS-001', 'AI-DEBUG-001', 'AI-IAM-001') THEN 'A02'
  WHEN "rule_id" IN ('AI-RAND-001', 'AI-HASH-001', 'AI-TLS-001') THEN 'A04'
  WHEN "rule_id" IN ('SEC-AWS-001', 'SEC-STRIPE-001', 'SEC-GITHUB-001', 'SEC-GENERIC-001') THEN 'A07'
  WHEN "rule_id" = 'SEC-PRIVATEKEY-001' THEN 'A04'
  WHEN "rule_id" = 'SEC-ENV-001' THEN 'A02'
  WHEN "rule_id" = 'SCA-VULN-001' THEN 'A03'
  WHEN "rule_id" = 'SCA-LICENSE-001' OR "source" = 'LICENSE' THEN 'N/A'
  WHEN "source" = 'SCA' THEN 'A03'
  WHEN "category" ILIKE '%injection%' OR "category" ILIKE '%cross-site scripting%' THEN 'A05'
  WHEN "category" ILIKE '%cryptographic%' THEN 'A04'
  WHEN "category" ILIKE '%authentication%' THEN 'A07'
  WHEN "category" ILIKE '%misconfiguration%' THEN 'A02'
  WHEN "category" ILIKE '%access control%' OR "category" ILIKE '%path traversal%'
    OR "category" ILIKE '%mass assignment%' OR "category" ILIKE '%redirect%'
    OR "category" ILIKE '%request forgery%' THEN 'A01'
  ELSE 'N/A'
END,
"owasp_taxonomy" = 'OWASP Top 10:2025';