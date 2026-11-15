import { promises as fs } from "node:fs";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import {
  auditLogs,
  engagements,
  organizations,
  scanRuns,
} from "../src/db/schema";
import { purgeSource } from "../src/lib/ingest";

const DEFAULT_DAYS = 30;

async function main() {
  const days = Number.parseInt(
    process.env.SOURCE_RETENTION_DAYS ?? String(DEFAULT_DAYS),
    10,
  );
  if (!Number.isFinite(days) || days < 0) {
    throw new Error("SOURCE_RETENTION_DAYS must be a non-negative number");
  }
  const forceAll = process.argv.includes("--all");
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const rows = await db
    .select({
      scan: scanRuns,
      engagement: engagements,
      org: organizations,
    })
    .from(scanRuns)
    .innerJoin(engagements, eq(engagements.id, scanRuns.engagementId))
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(and(isNotNull(scanRuns.sourcePath), isNotNull(scanRuns.sourcePath)));

  let purged = 0;
  let skippedMonitoring = 0;
  let skippedRecent = 0;

  for (const { scan, engagement, org } of rows) {
    if (!scan.sourcePath) continue;
    const continuous =
      engagement.tier === "CONTINUOUS_MONITORING" || org.plan === "MONITORING";
    if (continuous && !forceAll) {
      skippedMonitoring += 1;
      continue;
    }
    let mtime: Date;
    try {
      const stat = await fs.stat(scan.sourcePath);
      mtime = stat.mtime;
    } catch {
      // Source already gone; mark it purged so the UI reflects reality.
      await db
        .update(scanRuns)
        .set({ sourcePath: null, sourcePurgedAt: new Date() })
        .where(eq(scanRuns.id, scan.id));
      continue;
    }
    if (mtime.getTime() > cutoff) {
      skippedRecent += 1;
      continue;
    }

    await purgeSource(scan.sourcePath);
    await db
      .update(scanRuns)
      .set({ sourcePath: null, sourcePurgedAt: new Date() })
      .where(eq(scanRuns.id, scan.id));
    await db.insert(auditLogs).values({
      action: "source.retention_purged",
      orgId: org.id,
      engagementId: engagement.id,
      detail: {
        scanId: scan.id,
        sequence: scan.sequence,
        retentionDays: days,
        sourceMtime: mtime.toISOString(),
      },
    });
    purged += 1;
  }

  console.log(
    `Retention run complete: ${purged} purged, ${skippedRecent} inside ${days}-day window, ${skippedMonitoring} monitoring snapshots preserved${
      forceAll ? " (force-all)" : ""
    }.`,
  );
}

main()
  .then(async () => {
    await db.$client.end();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$client.end().catch(() => undefined);
    process.exitCode = 1;
  });
