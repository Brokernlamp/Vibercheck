import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { SessionUser, UserRole } from "./auth";
import { logger } from "./logger";

interface AuditInput {
  actor?: Pick<SessionUser, "id" | "email" | "role"> | null;
  actorEmail?: string | null;
  actorRole?: UserRole | null;
  action: string;
  orgId?: string | null;
  engagementId?: string | null;
  detail?: Record<string, unknown>;
}

export async function writeAudit({
  actor,
  actorEmail,
  actorRole,
  action,
  orgId,
  engagementId,
  detail = {},
}: AuditInput): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorId: actor?.id ?? null,
      actorRole: (actor?.role ?? actorRole ?? null) as UserRole | null,
      actorEmail: actor?.email ?? actorEmail ?? null,
      orgId: orgId ?? null,
      engagementId: engagementId ?? null,
      action,
      detail,
    });
  } catch (error) {
    // Audit failures should be visible but must not corrupt the user operation.
    logger.error("audit_log_write_failed", { action, error });
  }
}
