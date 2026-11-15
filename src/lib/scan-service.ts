import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  engagements,
  findings as findingsTable,
  organizations,
  reports,
  scanRuns,
  type ScanRun,
} from "@/db/schema";
import { countsTowardRisk, scanDirectory } from "./scan/engine";
import { computeRisk } from "./scan/score";
import {
  buildDraftSummary,
  buildExecutiveSummary,
  buildReportPayload,
  buildSelfServiceSummary,
  type ScanComparison,
} from "./report";
import { writeAudit } from "./audit";
import { logger } from "./logger";
import { claimScan, heartbeatScan } from "./scan-queue";
import { soloMode } from "./env";
import { publishGitHubCheck } from "./github-app";
import { blockingCiFindings, shouldFailGitHubCheck } from "./github-ci";

interface CreateScanInput {
  engagementId: string;
  kind: "INITIAL" | "RESCAN" | "CI";
  sourcePath: string;
  github?: {
    owner: string;
    repo: string;
    installationId: string;
    commitSha: string;
  };
  allowConcurrentQueue?: boolean;
}

export async function createScanRun({
  engagementId,
  kind,
  sourcePath,
  github,
  allowConcurrentQueue = false,
}: CreateScanInput): Promise<ScanRun> {
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) throw new Error("Engagement not found");

  const scan = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${engagementId}, 0))`,
    );
    const [active] = await tx
      .select({ id: scanRuns.id })
      .from(scanRuns)
      .where(
        and(
          eq(scanRuns.engagementId, engagementId),
          inArray(scanRuns.status, ["QUEUED", "RUNNING"]),
        ),
      )
      .limit(1);
    if (active && !allowConcurrentQueue) {
      throw new Error("A scan is already running for this engagement");
    }

    const [latest] = await tx
      .select({ sequence: scanRuns.sequence })
      .from(scanRuns)
      .where(eq(scanRuns.engagementId, engagementId))
      .orderBy(desc(scanRuns.sequence))
      .limit(1);

    const [created] = await tx
      .insert(scanRuns)
      .values({
        engagementId,
        sequence: (latest?.sequence ?? 0) + 1,
        kind,
        githubOwner: github?.owner ?? null,
        githubRepo: github?.repo ?? null,
        githubInstallationId: github?.installationId ?? null,
        githubCommitSha: github?.commitSha ?? null,
        status: "QUEUED",
        sourcePath,
      })
      .returning();

    await tx
      .update(engagements)
      .set({
        status: "SCANNING",
        reviewCompletedAt: null,
        reviewedById: null,
        reviewNote: null,
        updatedAt: new Date(),
      })
      .where(eq(engagements.id, engagementId));
    return created!;
  });

  await writeAudit({
    action: "scan.queued",
    orgId: engagement.orgId,
    engagementId,
    detail: { scanId: scan.id, sequence: scan.sequence, kind },
  });

  return scan;
}

export async function runScan(
  scanId: string,
  workerId = `inline-${process.pid}`,
): Promise<boolean> {
  // The claim is a single conditional UPDATE, so inline execution and any
  // number of workers can race without running the same scan twice.
  const claimed = await claimScan(scanId, workerId);
  if (!claimed) return false;

  const [row] = await db
    .select({
      scan: scanRuns,
      engagement: engagements,
      organization: organizations,
    })
    .from(scanRuns)
    .innerJoin(engagements, eq(engagements.id, scanRuns.engagementId))
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(scanRuns.id, scanId))
    .limit(1);

  if (!row) return false;
  if (!row.scan.sourcePath) {
    await failScan(row.scan, row.engagement, "The scan has no retained source.");
    return false;
  }

  const heartbeat = setInterval(() => {
    heartbeatScan(scanId, workerId).catch((error) => {
      logger.warn("scan.heartbeat_failed", { scanId, error });
    });
  }, 30_000);

  try {
    const result = await scanDirectory(row.scan.sourcePath);
    const selfService = soloMode();

    const [previous] = await db
      .select()
      .from(scanRuns)
      .where(
        and(
          eq(scanRuns.engagementId, row.scan.engagementId),
          eq(scanRuns.status, "SUCCEEDED"),
          lt(scanRuns.sequence, row.scan.sequence),
        ),
      )
      .orderBy(desc(scanRuns.sequence))
      .limit(1);

    const previousFindings = previous
      ? await db
          .select()
          .from(findingsTable)
          .where(eq(findingsTable.scanId, previous.id))
      : [];
    const previousByFingerprint = new Map(
      previousFindings.map((finding) => [finding.fingerprint, finding]),
    );
    const currentFingerprints = new Set(
      result.findings.map((finding) => finding.fingerprint),
    );
    const resolvedPrevious = previousFindings.filter(
      (finding) =>
        (selfService
          ? finding.analystStatus !== "DISMISSED"
          : finding.analystStatus === "CONFIRMED") &&
        finding.source !== "ANALYST" &&
        !currentFingerprints.has(finding.fingerprint),
    );

    const comparison: ScanComparison | null = previous
      ? {
          previousScanId: previous.id,
          previousSequence: previous.sequence,
          resolvedCount: resolvedPrevious.length,
          newCount: result.findings.filter(
            (finding) => !previousByFingerprint.has(finding.fingerprint),
          ).length,
          outstandingCount: result.findings.filter((finding) =>
            previousByFingerprint.has(finding.fingerprint),
          ).length,
          scoreDelta: 0,
          resolved: resolvedPrevious.slice(0, 100).map((finding) => ({
            fingerprint: finding.fingerprint,
            title: finding.analystTitle?.trim() || finding.title,
            severity: finding.severity,
            filePath: finding.filePath,
          })),
        }
      : null;

    const now = new Date();
    const findingRows: Array<typeof findingsTable.$inferInsert> =
      result.findings.map((finding) => {
        const prior = previousByFingerprint.get(finding.fingerprint);
        return {
          scanId,
          engagementId: row.scan.engagementId,
          fingerprint: finding.fingerprint,
          ruleId: finding.ruleId,
          source: finding.source,
          title: finding.title,
          severity: finding.severity,
          owasp: finding.owasp,
          category: finding.category,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          snippet: finding.snippet,
          description: finding.description,
          remediation: finding.remediation,
          confidence: finding.confidence,
          analystStatus: prior?.analystStatus ?? "OPEN",
          analystComment: prior?.analystComment ?? null,
          analystPriority: prior?.analystPriority ?? null,
          analystTitle: prior?.analystTitle ?? null,
          analystDescription: prior?.analystDescription ?? null,
          analystRemediation: prior?.analystRemediation ?? null,
          triagedById: prior?.triagedById ?? null,
          triagedAt: prior?.triagedAt ?? null,
          verification: prior ? "OUTSTANDING" : "UNVERIFIED",
          clientStatus:
            prior?.clientStatus === "REMEDIATED" ? "OPEN" : (prior?.clientStatus ?? "OPEN"),
          clientNote: null,
          remediatedAt: null,
          addedById: prior?.addedById ?? null,
        };
      });

    // Analyst-added findings are not derivable from source. Carry them forward
    // so a re-scan cannot silently erase a manual observation.
    if (previous) {
      for (const prior of previousFindings) {
        if (prior.source !== "ANALYST") continue;
        if (currentFingerprints.has(prior.fingerprint)) continue;
        findingRows.push({
          scanId,
          engagementId: row.scan.engagementId,
          fingerprint: prior.fingerprint,
          ruleId: prior.ruleId,
          source: "ANALYST",
          title: prior.title,
          severity: prior.severity,
          owasp: prior.owasp,
          category: prior.category,
          filePath: prior.filePath,
          lineStart: prior.lineStart,
          lineEnd: prior.lineEnd,
          snippet: prior.snippet,
          description: prior.description,
          remediation: prior.remediation,
          confidence: prior.confidence,
          analystStatus: prior.analystStatus,
          analystComment: prior.analystComment,
          analystPriority: prior.analystPriority,
          analystTitle: prior.analystTitle,
          analystDescription: prior.analystDescription,
          analystRemediation: prior.analystRemediation,
          triagedById: prior.triagedById,
          triagedAt: prior.triagedAt,
          verification: "OUTSTANDING",
          clientStatus: prior.clientStatus,
          clientNote: prior.clientNote,
          remediatedAt: prior.remediatedAt,
          addedById: prior.addedById,
        });
      }
    }

    // Mirrors the engine: heuristic noise from example, test, docs, vendored and
    // generated paths stays visible for triage but does not drive the score.
    const risk = computeRisk(
      findingRows
        .filter((finding) =>
          countsTowardRisk({
            source: finding.source!,
            ruleId: finding.ruleId!,
            filePath: finding.filePath!,
          }),
        )
        .map((finding) => ({
          severity: finding.severity!,
          confidence: finding.confidence ?? 70,
        })),
    );
    if (comparison) comparison.scoreDelta = risk.score - (previous?.score ?? 0);

    const summaryInput = findingRows.map((finding) => ({
      title: finding.title!,
      analystTitle: finding.analystTitle ?? null,
      description: finding.description!,
      analystDescription: finding.analystDescription ?? null,
      severity: finding.severity!,
      confidence: finding.confidence ?? 70,
      filePath: finding.filePath!,
      lineStart: finding.lineStart!,
      analystStatus: (finding.analystStatus ?? "OPEN") as
        | "OPEN"
        | "CONFIRMED"
        | "DISMISSED",
    }));
    const finishedAt = new Date();
    const scanSummary = selfService
      ? buildSelfServiceSummary({
          engagement: row.engagement,
          organizationName: row.organization.name,
          findings: summaryInput,
          filesScanned: result.filesScanned,
          finishedAt,
          score: risk.score,
          grade: risk.grade,
        })
      : buildDraftSummary({
          engagement: row.engagement,
          organizationName: row.organization.name,
          findings: summaryInput,
          filesScanned: result.filesScanned,
          score: risk.score,
          grade: risk.grade,
        });

    const autoFinalizedReport = await db.transaction(async (tx) => {
      if (resolvedPrevious.length > 0) {
        await tx
          .update(findingsTable)
          .set({
            verification: "RESOLVED",
            clientStatus: "REMEDIATED",
            remediatedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(findingsTable.scanId, previous!.id),
              inArray(
                findingsTable.fingerprint,
                resolvedPrevious.map((finding) => finding.fingerprint),
              ),
              ne(findingsTable.analystStatus, "DISMISSED"),
            ),
          );
      }

      const persistedFindings =
        findingRows.length > 0
          ? await tx.insert(findingsTable).values(findingRows).returning()
          : [];

      const [updatedScan] = await tx
        .update(scanRuns)
        .set({
          status: "SUCCEEDED",
          finishedAt,
          durationMs: result.durationMs,
          filesScanned: result.filesScanned,
          sourceBytes: result.bytesScanned,
          engineVersion: result.engineVersion,
          score: risk.score,
          grade: risk.grade,
          counts: risk.counts,
          comparison,
          leaseOwner: null,
          heartbeatAt: null,
          leaseExpiresAt: null,
        })
        .where(eq(scanRuns.id, scanId))
        .returning();

      const status = selfService
        ? row.scan.kind === "RESCAN"
          ? "REMEDIATION"
          : "DELIVERED"
        : "UNDER_REVIEW";
      const [updatedEngagement] = await tx
        .update(engagements)
        .set({
          status,
          reviewCompletedAt: null,
          reviewedById: null,
          reviewNote: null,
          updatedAt: finishedAt,
          ...(result.detectedStack && !row.engagement.intake?.stack
            ? { intake: { ...row.engagement.intake, detectedStack: result.detectedStack } }
            : {}),
        })
        .where(eq(engagements.id, row.scan.engagementId))
        .returning();

      const [latestReport] = await tx
        .select({ version: reports.version })
        .from(reports)
        .where(eq(reports.engagementId, row.scan.engagementId))
        .orderBy(desc(reports.version))
        .limit(1);

      const version = (latestReport?.version ?? 0) + 1;
      const reportSummary = selfService
        ? scanSummary
        : await buildFinalSummary(
            row.engagement,
            row.organization.name,
            updatedScan,
            persistedFindings,
          );
      const payload = selfService
        ? buildReportPayload({
            engagement: updatedEngagement,
            organization: row.organization,
            scan: updatedScan,
            findings: persistedFindings,
            version,
            executiveSummary: reportSummary,
            analystNote: null,
            reviewMode: "self-service",
          })
        : null;

      const [createdReport] = await tx
        .insert(reports)
        .values({
          engagementId: row.scan.engagementId,
          scanId,
          version,
          status: selfService ? "FINAL" : "DRAFT",
          executiveSummary: reportSummary,
          payload,
          finalizedAt: selfService ? finishedAt : null,
          deliveredAt: selfService ? finishedAt : null,
        })
        .returning({ id: reports.id, version: reports.version });
      return selfService ? createdReport : null;
    });

    if (result.warnings.length > 0) {
      // A dependency feed outage is not a clean scan. Surface it in the audit
      // trail so missing advisory data is not mistaken for a clean result.
      logger.warn("scan.completed_with_warnings", {
        scanId,
        warnings: result.warnings.slice(0, 10),
      });
    }

    await writeAudit({
      action: "scan.completed",
      orgId: row.engagement.orgId,
      engagementId: row.scan.engagementId,
      detail: {
        scanId,
        sequence: row.scan.sequence,
        findings: findingRows.length,
        score: risk.score,
        grade: risk.grade,
        durationMs: result.durationMs,
        warnings: result.warnings.slice(0, 10),
        resolved: resolvedPrevious.length,
        comparison: comparison
          ? {
              newCount: comparison.newCount,
              outstandingCount: comparison.outstandingCount,
              resolvedCount: comparison.resolvedCount,
            }
          : null,
      },
    });
    if (autoFinalizedReport) {
      await writeAudit({
        action: "report.auto_finalized",
        orgId: row.engagement.orgId,
        engagementId: row.scan.engagementId,
        detail: {
          reportId: autoFinalizedReport.id,
          version: autoFinalizedReport.version,
          scanId,
          reviewMode: "self-service",
        },
      });
    }
    if (
      row.scan.kind === "CI" &&
      row.scan.githubOwner &&
      row.scan.githubRepo &&
      row.scan.githubInstallationId &&
      row.scan.githubCommitSha
    ) {
      const blockingFindings = blockingCiFindings(
        row.engagement.ciFailurePolicy,
        result.findings,
      );
      const incompleteScan = result.truncated || result.warnings.length > 0;
      const checkFailed = shouldFailGitHubCheck(
        row.engagement.ciFailurePolicy,
        result.findings,
        incompleteScan,
      );
      const findingSummary = result.findings
        .slice(0, 40)
        .map(
          (finding) =>
            `- **${finding.severity}** ${finding.title} (\`${finding.filePath}:${finding.lineStart}\`)`,
        )
        .join("\n");
      try {
        await publishGitHubCheck({
          owner: row.scan.githubOwner,
          repo: row.scan.githubRepo,
          installationId: row.scan.githubInstallationId,
          commitSha: row.scan.githubCommitSha,
          conclusion: checkFailed ? "failure" : "success",
          title:
            blockingFindings.length > 0
              ? `${blockingFindings.length} finding(s) block this change`
              : checkFailed
                ? "Scan incomplete; policy requires a complete scan"
                : `${result.findings.length} finding(s); policy passed`,
          summary: [
            `Policy: ${row.engagement.ciFailurePolicy}.`,
            `Found ${result.findings.length} finding(s); ${blockingFindings.length} block this change.`,
            result.findings.length > 0 ? findingSummary : "No findings detected.",
            result.truncated
              ? "Warning: scan limits were reached; this result covers a partial repository."
              : "",
            result.warnings.length > 0
              ? "Warning: the scan completed with warnings; review the VibeCheck report."
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        });
      } catch (error) {
        logger.warn("github_check_publish_failed", {
          scanId,
          owner: row.scan.githubOwner,
          repo: row.scan.githubRepo,
          error,
        });
      }
    }
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scan failure";
    await failScan(row.scan, row.engagement, message);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}

async function failScan(
  scan: ScanRun,
  engagement: typeof engagements.$inferSelect,
  message: string,
): Promise<void> {
  const now = new Date();
  try {
    await db
      .update(scanRuns)
      .set({
        status: "FAILED",
        finishedAt: now,
        error: message.slice(0, 2000),
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
      detail: { scanId: scan.id, error: message.slice(0, 500) },
    });
    if (
      scan.kind === "CI" &&
      scan.githubOwner &&
      scan.githubRepo &&
      scan.githubInstallationId &&
      scan.githubCommitSha
    ) {
      try {
        await publishGitHubCheck({
          owner: scan.githubOwner,
          repo: scan.githubRepo,
          installationId: scan.githubInstallationId,
          commitSha: scan.githubCommitSha,
          conclusion: "failure",
          title: "Security scan failed",
          summary:
            "VibeCheck could not complete this commit's security scan. Check the VibeCheck scan record and service logs before merging.\n\n" +
            message.slice(0, 4000),
        });
      } catch (error) {
        logger.warn("github_check_publish_failed", {
          scanId: scan.id,
          owner: scan.githubOwner,
          repo: scan.githubRepo,
          error,
        });
      }
    }
  } catch (error) {
    logger.error("scan_failure_persist_failed", { scanId: scan.id, error });
  }
}

export async function buildFinalSummary(
  engagement: typeof engagements.$inferSelect,
  organizationName: string,
  scan: ScanRun,
  findings: Array<typeof findingsTable.$inferSelect>,
): Promise<string> {
  return buildExecutiveSummary({
    engagement,
    organizationName,
    findings,
    dismissedCount: findings.filter(
      (finding) => finding.analystStatus === "DISMISSED",
    ).length,
    filesScanned: scan.filesScanned,
    finishedAt: scan.finishedAt,
  });
}
