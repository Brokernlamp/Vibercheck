"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  engagements,
  findings,
  organizations,
  reports,
  scanRuns,
} from "@/db/schema";
import { requireStaff } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { OWASP_CATEGORIES, SEVERITY_ORDER, type Severity } from "@/lib/domain";
import { redirectWithError } from "@/lib/navigation";
import { buildReportPayload } from "@/lib/report";
import { canFinalizeReport, getReviewState } from "@/lib/review";
import { buildFinalSummary } from "@/lib/scan-service";

function field(formData: FormData, name: string, max = 4000): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function backTo(engagementId: string, anchor?: string): string {
  return `/analyst/engagements/${engagementId}${
    anchor ? `#finding-${anchor}` : ""
  }`;
}

async function resetReviewSignoff(engagementId: string): Promise<void> {
  await db
    .update(engagements)
    .set({
      reviewCompletedAt: null,
      reviewedById: null,
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(eq(engagements.id, engagementId));
}

export async function triageFindingAction(formData: FormData): Promise<void> {
  const analyst = await requireStaff();
  const findingId = field(formData, "findingId", 64);
  const decision = field(formData, "decision", 20);
  let comment = field(formData, "comment", 2000);
  const priorityRaw = field(formData, "priority", 10);
  const priority = ["P0", "P1", "P2", "P3"].includes(priorityRaw)
    ? priorityRaw
    : null;
  const overrideTitle = field(formData, "overrideTitle", 240);
  const overrideDescription = field(formData, "overrideDescription", 4000);
  const overrideRemediation = field(formData, "overrideRemediation", 4000);

  const [row] = await db
    .select({ finding: findings, engagement: engagements })
    .from(findings)
    .innerJoin(engagements, eq(engagements.id, findings.engagementId))
    .where(eq(findings.id, findingId))
    .limit(1);
  if (!row) redirectWithError("/analyst", "Finding not found.");

  const back = backTo(row.engagement.id, findingId);
  const [latestScan] = await db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, row.engagement.id))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  if (!latestScan || latestScan.id !== row.finding.scanId) {
    redirectWithError(back, "This finding belongs to a superseded scan.");
  }

  const [report] = await db
    .select({ id: reports.id, status: reports.status })
    .from(reports)
    .where(eq(reports.scanId, row.finding.scanId))
    .orderBy(desc(reports.version))
    .limit(1);
  if (!report || report.status === "FINAL") {
    redirectWithError(back, "Finalized reports are immutable. Re-scan to review changes.");
  }

  if (decision === "dismiss" && comment.length < 3) {
    // Add default comment if none provided
    comment = "False positive or out of scope - see analyst note";
  }
  if (!["confirm", "dismiss", "reopen"].includes(decision)) {
    redirectWithError(back, "Unknown review decision.");
  }

  const now = new Date();
  await db
    .update(findings)
    .set({
      analystStatus:
        decision === "confirm"
          ? "CONFIRMED"
          : decision === "dismiss"
            ? "DISMISSED"
            : "OPEN",
      analystComment: comment || null,
      analystPriority: decision === "confirm" ? priority : null,
      analystTitle: overrideTitle || null,
      analystDescription: overrideDescription || null,
      analystRemediation: overrideRemediation || null,
      triagedById: decision === "reopen" ? null : analyst.id,
      triagedAt: decision === "reopen" ? null : now,
      updatedAt: now,
    })
    .where(eq(findings.id, findingId));

  await resetReviewSignoff(row.engagement.id);
  await writeAudit({
    actor: analyst,
    action: `finding.${decision}`,
    orgId: row.engagement.orgId,
    engagementId: row.engagement.id,
    detail: {
      findingId,
      ruleId: row.finding.ruleId,
      severity: row.finding.severity,
      priority,
      comment: comment.slice(0, 300),
    },
  });
  revalidatePath(`/analyst/engagements/${row.engagement.id}`);
  redirect(back);
}

export async function bulkConfirmAction(formData: FormData): Promise<void> {
  const analyst = await requireStaff();
  const engagementId = field(formData, "engagementId", 64);
  const threshold = Math.max(
    0,
    Math.min(100, Number.parseInt(field(formData, "threshold", 5) || "80", 10) || 80),
  );
  const back = backTo(engagementId);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) redirectWithError("/analyst", "Engagement not found.");

  const [latestScan] = await db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  if (!latestScan) redirectWithError(back, "No scan is available.");

  const now = new Date();
  const updated = await db
    .update(findings)
    .set({
      analystStatus: "CONFIRMED",
      triagedById: analyst.id,
      triagedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(findings.scanId, latestScan.id),
        eq(findings.analystStatus, "OPEN"),
        gte(findings.confidence, threshold),
      ),
    )
    .returning({ id: findings.id });

  await resetReviewSignoff(engagementId);
  await writeAudit({
    actor: analyst,
    action: "finding.bulk_confirmed",
    orgId: engagement.orgId,
    engagementId,
    detail: { threshold, count: updated.length, scanId: latestScan.id },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent(`${updated.length} findings confirmed`)}`);
}

export async function completeReviewAction(formData: FormData): Promise<void> {
  const analyst = await requireStaff();
  const engagementId = field(formData, "engagementId", 64);
  const note = field(formData, "reviewNote", 4000);
  const back = backTo(engagementId);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) redirectWithError("/analyst", "Engagement not found.");

  const [latestScan] = await db
    .select({ id: scanRuns.id })
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  if (!latestScan) redirectWithError(back, "No scan is available.");

  const reviewFindings = await db
    .select({ analystStatus: findings.analystStatus })
    .from(findings)
    .where(eq(findings.scanId, latestScan.id));
  const state = getReviewState(reviewFindings);
  if (!state.triageComplete) {
    redirectWithError(
      back,
      `${state.open} finding${state.open === 1 ? "" : "s"} still need a decision.`,
    );
  }

  const now = new Date();
  await db
    .update(engagements)
    .set({
      reviewCompletedAt: now,
      reviewedById: analyst.id,
      reviewNote: note || null,
      updatedAt: now,
    })
    .where(eq(engagements.id, engagementId));
  await writeAudit({
    actor: analyst,
    action: "review.completed",
    orgId: engagement.orgId,
    engagementId,
    detail: {
      scanId: latestScan.id,
      total: state.total,
      confirmed: state.confirmed,
      dismissed: state.dismissed,
      note: note.slice(0, 300),
    },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Analyst review completed")}`);
}

export async function finalizeReportAction(formData: FormData): Promise<void> {
  const analyst = await requireStaff();
  const engagementId = field(formData, "engagementId", 64);
  const providedSummary = field(formData, "executiveSummary", 12000);
  const back = backTo(engagementId);

  const [row] = await db
    .select({ engagement: engagements, organization: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) redirectWithError("/analyst", "Engagement not found.");

  const [scan] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  if (!scan) redirectWithError(back, "No scan is available.");

  const reviewFindings = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scan.id));
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.scanId, scan.id))
    .orderBy(desc(reports.version))
    .limit(1);

  const gate = canFinalizeReport({
    findings: reviewFindings,
    reviewCompletedAt: row.engagement.reviewCompletedAt,
    reportStatus: report?.status ?? null,
    hasScan: Boolean(scan && scan.status === "SUCCEEDED"),
  });
  if (!gate.ok || !report) {
    redirectWithError(back, gate.reasons[0] ?? "The report cannot be finalized.");
  }

  const summary =
    providedSummary.length >= 40
      ? providedSummary
      : await buildFinalSummary(
          row.engagement,
          row.organization.name,
          scan,
          reviewFindings,
        );
  const payload = buildReportPayload({
    engagement: row.engagement,
    organization: row.organization,
    scan,
    findings: reviewFindings,
    version: report.version,
    executiveSummary: summary,
    analystNote: row.engagement.reviewNote,
  });
  const now = new Date();
  const delivered = Boolean(row.engagement.termsAcceptedAt);

  await db.transaction(async (tx) => {
    await tx
      .update(reports)
      .set({
        status: "FINAL",
        executiveSummary: summary,
        payload,
        finalizedById: analyst.id,
        finalizedAt: now,
        deliveredAt: delivered ? now : null,
      })
      .where(eq(reports.id, report.id));
    await tx
      .update(engagements)
      .set({
        status: delivered ? "DELIVERED" : "READY_FOR_CLIENT",
        updatedAt: now,
      })
      .where(eq(engagements.id, engagementId));
  });

  await writeAudit({
    actor: analyst,
    action: "report.finalized",
    orgId: row.engagement.orgId,
    engagementId,
    detail: {
      reportId: report.id,
      version: report.version,
      scanId: scan.id,
      confirmed: reviewFindings.filter((f) => f.analystStatus === "CONFIRMED").length,
      dismissed: reviewFindings.filter((f) => f.analystStatus === "DISMISSED").length,
      delivered,
    },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Report finalized")}`);
}

export async function addFindingAction(formData: FormData): Promise<void> {
  const analyst = await requireStaff();
  const engagementId = field(formData, "engagementId", 64);
  const title = field(formData, "title", 240);
  const severityRaw = field(formData, "severity", 20) as Severity;
  const owaspRaw = field(formData, "owasp", 10);
  const category = field(formData, "category", 120) || "Analyst observation";
  const filePath = field(formData, "filePath", 400) || "manual-review";
  const lineStart = Math.max(
    1,
    Number.parseInt(field(formData, "lineStart", 10) || "1", 10) || 1,
  );
  const lineEnd = Math.max(
    lineStart,
    Number.parseInt(field(formData, "lineEnd", 10) || String(lineStart), 10) ||
      lineStart,
  );
  const description = field(formData, "description", 4000);
  const remediation = field(formData, "remediation", 4000);
  const comment = field(formData, "comment", 2000);
  const priorityRaw = field(formData, "priority", 10);
  const priority = ["P0", "P1", "P2", "P3"].includes(priorityRaw)
    ? priorityRaw
    : null;
  const back = backTo(engagementId);

  if (title.length < 5) redirectWithError(back, "Add a descriptive finding title.");
  if (!SEVERITY_ORDER.includes(severityRaw)) {
    redirectWithError(back, "Choose a valid severity.");
  }
  if (description.length < 10) {
    redirectWithError(back, "Describe the issue and its impact.");
  }
  if (remediation.length < 10) {
    redirectWithError(back, "Add remediation guidance.");
  }
  const owasp = owaspRaw in OWASP_CATEGORIES ? owaspRaw : "A04";

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) redirectWithError("/analyst", "Engagement not found.");

  const [scan] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId))
    .orderBy(desc(scanRuns.sequence))
    .limit(1);
  if (!scan) redirectWithError(back, "Run a scan before adding findings.");
  const [report] = await db
    .select({ status: reports.status })
    .from(reports)
    .where(eq(reports.scanId, scan.id))
    .orderBy(desc(reports.version))
    .limit(1);
  if (report?.status === "FINAL") {
    redirectWithError(back, "The report is already finalized.");
  }

  const now = new Date();
  await db.insert(findings).values({
    scanId: scan.id,
    engagementId,
    fingerprint: `analyst:${randomUUID()}`,
    ruleId: "ANALYST-001",
    source: "ANALYST",
    title,
    severity: severityRaw,
    owasp,
    category,
    filePath,
    lineStart,
    lineEnd,
    snippet: "",
    description,
    remediation,
    confidence: 100,
    analystStatus: "CONFIRMED",
    analystComment: comment || null,
    analystPriority: priority,
    triagedById: analyst.id,
    triagedAt: now,
    addedById: analyst.id,
  });
  await resetReviewSignoff(engagementId);
  await writeAudit({
    actor: analyst,
    action: "finding.added",
    orgId: engagement.orgId,
    engagementId,
    detail: { title, severity: severityRaw, filePath, lineStart, scanId: scan.id },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Analyst finding added")}`);
}
