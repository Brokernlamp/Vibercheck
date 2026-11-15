import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings, reports, scanRuns } from "@/db/schema";
import { severityRank } from "./scan/score";

export async function getLatestScan(engagementId: string) {
  const [scan] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  return scan ?? null;
}

export async function getLatestSucceededScan(engagementId: string) {
  const [scan] = await db
    .select()
    .from(scanRuns)
    .where(
      and(
        eq(scanRuns.engagementId, engagementId),
        eq(scanRuns.status, "SUCCEEDED"),
      ),
    )
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  return scan ?? null;
}

export async function getScanHistory(engagementId: string) {
  return db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence));
}

export async function getFindingsForScan(scanId: string) {
  const rows = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanId));
  return rows.sort((a, b) => {
    const severityDelta = severityRank(a.severity) - severityRank(b.severity);
    if (severityDelta !== 0) return severityDelta;
    return a.filePath.localeCompare(b.filePath) || a.lineStart - b.lineStart;
  });
}

export async function getLatestReportForScan(scanId: string) {
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.scanId, scanId))
    .orderBy(desc(reports.version))
    .limit(1);
  return report ?? null;
}

export async function getLatestReport(engagementId: string, status?: "DRAFT" | "FINAL") {
  const [report] = await db
    .select()
    .from(reports)
    .where(
      status
        ? and(eq(reports.engagementId, engagementId), eq(reports.status, status))
        : eq(reports.engagementId, engagementId),
    )
    .orderBy(desc(reports.version))
    .limit(1);
  return report ?? null;
}

export async function getLatestFinalReport(engagementId: string) {
  return getLatestReport(engagementId, "FINAL");
}

export async function getReportsForEngagement(engagementId: string) {
  return db
    .select()
    .from(reports)
    .where(eq(reports.engagementId, engagementId))
    .orderBy(desc(reports.version));
}
