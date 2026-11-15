import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  engagements,
  scanRuns,
  systemHeartbeats,
  type ScanRun,
} from "@/db/schema";
import { writeAudit } from "./audit";
import { logger } from "./logger";

export const MAX_SCAN_ATTEMPTS = 3;
export const SCAN_LEASE_MS = 10 * 60 * 1000;
export const WORKER_HEARTBEAT_NAME = "scan-worker";

export async function claimScan(
  scanId: string,
  workerId: string,
): Promise<ScanRun | null> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SCAN_LEASE_MS);
  const [claimed] = await db
    .update(scanRuns)
    .set({
      status: "RUNNING",
      startedAt: now,
      attempts: sql`${scanRuns.attempts} + 1`,
      leaseOwner: workerId,
      heartbeatAt: now,
      leaseExpiresAt: expiresAt,
      error: null,
    })
    .where(and(eq(scanRuns.id, scanId), eq(scanRuns.status, "QUEUED")))
    .returning();
  return claimed ?? null;
}

export async function heartbeatScan(
  scanId: string,
  workerId: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(scanRuns)
    .set({
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + SCAN_LEASE_MS),
    })
    .where(
      and(
        eq(scanRuns.id, scanId),
        eq(scanRuns.status, "RUNNING"),
        eq(scanRuns.leaseOwner, workerId),
      ),
    );
}

export async function clearScanLease(scanId: string): Promise<void> {
  await db
    .update(scanRuns)
    .set({ leaseOwner: null, heartbeatAt: null, leaseExpiresAt: null })
    .where(eq(scanRuns.id, scanId));
}

export async function nextQueuedScan(): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.status, "QUEUED"))
    .orderBy(asc(scanRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export interface QueueStats {
  queued: number;
  running: number;
  oldestQueuedAt: Date | null;
}

export async function queueStats(): Promise<QueueStats> {
  const rows = await db
    .select({
      status: scanRuns.status,
      createdAt: scanRuns.createdAt,
    })
    .from(scanRuns)
    .where(sql`${scanRuns.status} in ('QUEUED', 'RUNNING')`);
  const queued = rows.filter((row) => row.status === "QUEUED");
  return {
    queued: queued.length,
    running: rows.filter((row) => row.status === "RUNNING").length,
    oldestQueuedAt:
      queued.length > 0
        ? new Date(Math.min(...queued.map((row) => row.createdAt.getTime())))
        : null,
  };
}

/**
 * Reclaim scans whose worker disappeared. A scan is requeued while attempts
 * remain, then failed with an audit record so it does not sit RUNNING forever.
 */
export async function recoverStaleScans(): Promise<number> {
  const now = new Date();
  const stale = await db
    .select({ scan: scanRuns, engagement: engagements })
    .from(scanRuns)
    .innerJoin(engagements, eq(engagements.id, scanRuns.engagementId))
    .where(
      and(
        eq(scanRuns.status, "RUNNING"),
        lt(scanRuns.leaseExpiresAt, now),
      ),
    );

  for (const { scan, engagement } of stale) {
    const exhausted = scan.attempts >= MAX_SCAN_ATTEMPTS;
    if (exhausted) {
      const message = `Scan worker lease expired after ${scan.attempts} attempts.`;
      await db
        .update(scanRuns)
        .set({
          status: "FAILED",
          finishedAt: now,
          error: message,
          leaseOwner: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
        })
        .where(eq(scanRuns.id, scan.id));
      await db
        .update(engagements)
        .set({ status: "SCAN_FAILED", updatedAt: now })
        .where(eq(engagements.id, engagement.id));
      await writeAudit({
        action: "scan.failed",
        orgId: engagement.orgId,
        engagementId: engagement.id,
        detail: { scanId: scan.id, error: message, reason: "lease_exhausted" },
      });
      logger.error("scan.lease_exhausted", {
        scanId: scan.id,
        engagementId: engagement.id,
        attempts: scan.attempts,
      });
    } else {
      await db
        .update(scanRuns)
        .set({
          status: "QUEUED",
          leaseOwner: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          error: "Worker lease expired; scan requeued.",
        })
        .where(eq(scanRuns.id, scan.id));
      await db
        .update(engagements)
        .set({ status: "SCANNING", updatedAt: now })
        .where(eq(engagements.id, engagement.id));
      await writeAudit({
        action: "scan.requeued",
        orgId: engagement.orgId,
        engagementId: engagement.id,
        detail: { scanId: scan.id, attempts: scan.attempts, reason: "lease_expired" },
      });
      logger.warn("scan.requeued", { scanId: scan.id, attempts: scan.attempts });
    }
  }
  return stale.length;
}

export async function recordWorkerHeartbeat(
  workerId: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date();
  await db
    .insert(systemHeartbeats)
    .values({
      name: WORKER_HEARTBEAT_NAME,
      lastSeenAt: now,
      detail: { workerId, ...detail },
    })
    .onConflictDoUpdate({
      target: systemHeartbeats.name,
      set: { lastSeenAt: now, detail: { workerId, ...detail } },
    });
}

export async function workerHeartbeatAgeSeconds(): Promise<number | null> {
  const [row] = await db
    .select({ lastSeenAt: systemHeartbeats.lastSeenAt })
    .from(systemHeartbeats)
    .where(eq(systemHeartbeats.name, WORKER_HEARTBEAT_NAME))
    .limit(1);
  if (!row) return null;
  return Math.max(0, (Date.now() - row.lastSeenAt.getTime()) / 1000);
}
