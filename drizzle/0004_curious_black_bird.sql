ALTER TABLE "findings" ADD COLUMN "cwe" jsonb DEFAULT '[]'::jsonb NOT NULL;
UPDATE "findings"
SET "cwe" = CASE
  WHEN "rule_id" = 'AI-SQL-001' THEN '["CWE-89"]'::jsonb
  WHEN "rule_id" = 'AI-AUTH-001' THEN '["CWE-862"]'::jsonb
  WHEN "rule_id" = 'AI-CRED-001' THEN '["CWE-798"]'::jsonb
  WHEN "rule_id" = 'AI-CORS-001' THEN '["CWE-942"]'::jsonb
  WHEN "rule_id" = 'AI-JWT-001' THEN '["CWE-321","CWE-347"]'::jsonb
  WHEN "rule_id" = 'AI-RAND-001' THEN '["CWE-338"]'::jsonb
  WHEN "rule_id" = 'AI-HASH-001' THEN '["CWE-916","CWE-256"]'::jsonb
  WHEN "rule_id" = 'AI-EVAL-001' THEN '["CWE-95"]'::jsonb
  WHEN "rule_id" = 'AI-UPLOAD-001' THEN '["CWE-22"]'::jsonb
  WHEN "rule_id" = 'AI-SSRF-001' THEN '["CWE-918"]'::jsonb
  WHEN "rule_id" = 'AI-MASS-001' THEN '["CWE-915"]'::jsonb
  WHEN "rule_id" = 'AI-RATE-001' THEN '["CWE-307"]'::jsonb
  WHEN "rule_id" = 'AI-DEBUG-001' THEN '["CWE-209"]'::jsonb
  WHEN "rule_id" = 'AI-RLS-001' THEN '["CWE-862"]'::jsonb
  WHEN "rule_id" = 'AI-TLS-001' THEN '["CWE-295"]'::jsonb
  WHEN "rule_id" = 'AI-IAM-001' THEN '["CWE-732"]'::jsonb
  WHEN "rule_id" = 'AI-XSS-001' THEN '["CWE-79"]'::jsonb
  WHEN "rule_id" = 'AI-REDIR-001' THEN '["CWE-601"]'::jsonb
  WHEN "rule_id" = 'MCP-AUTH-001' THEN '["CWE-306"]'::jsonb
  WHEN "rule_id" = 'MCP-PERM-001' THEN '["CWE-250"]'::jsonb
  WHEN "rule_id" = 'MCP-CMD-001' THEN '["CWE-78"]'::jsonb
  WHEN "rule_id" IN ('SEC-AWS-001', 'SEC-STRIPE-001', 'SEC-GITHUB-001', 'SEC-GENERIC-001', 'SEC-ENV-001')
    THEN '["CWE-798"]'::jsonb
  WHEN "rule_id" = 'SEC-PRIVATEKEY-001' THEN '["CWE-321"]'::jsonb
  WHEN "rule_id" = 'SCA-VULN-001' THEN '["CWE-1104"]'::jsonb
  ELSE "cwe"
END;