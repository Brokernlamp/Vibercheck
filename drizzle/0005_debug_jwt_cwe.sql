UPDATE "findings"
SET "cwe" = "cwe" || '["CWE-489"]'::jsonb
WHERE "rule_id" = 'AI-DEBUG-001'
  AND NOT "cwe" @> '["CWE-489"]'::jsonb;

UPDATE "findings"
SET "cwe" = "cwe" || '["CWE-798"]'::jsonb
WHERE "rule_id" = 'AI-JWT-001'
  AND NOT "cwe" @> '["CWE-798"]'::jsonb;
