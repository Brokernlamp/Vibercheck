"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  engagements,
  findings,
  reports,
  scanRuns,
  subscriptions,
} from "@/db/schema";
import { requireClient, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { runSimulatedCheckout } from "@/lib/billing";
import {
  TIERS,
  TIER_ORDER,
  type AuditTier,
  type CiFailurePolicy,
} from "@/lib/domain";
import {
  allowSampleSource,
  billingMode,
  isFreeMode,
  openAccess,
  scanExecution,
  soloMode,
} from "@/lib/env";
import {
  assertSourceDirectory,
  cloneRepository,
  copySampleRepository,
  extractZip,
  githubRepositoryKey,
  newSourceDirectory,
  purgeSource,
  validateRepositoryUrl,
} from "@/lib/ingest";
import { redirectWithError } from "@/lib/navigation";
import { canViewEngagement } from "@/lib/permissions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createScanRun, runScan } from "@/lib/scan-service";
import { installationTokenForRepository, isGitHubAppConfigured } from "@/lib/github-app";

export interface CreateEngagementState {
  error?: string;
}

function field(formData: FormData, name: string, max = 2000): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

export async function createEngagementAction(
  _previousState: CreateEngagementState,
  formData: FormData,
): Promise<CreateEngagementState> {
  const user = await requireClient();
  if (!user.orgId) return { error: "Your account is not linked to an organization." };

  const name = field(formData, "name", 90);
  if (name.length < 2) return { error: "Give the engagement a name." };
  const tierValue = soloMode()
    ? "QUICK_SCAN"
    : (field(formData, "tier", 40) as AuditTier);
  if (!TIER_ORDER.includes(tierValue)) return { error: "Choose a valid audit tier." };

  const sourceMode = field(formData, "sourceMode", 20);
  if (!["sample", "zip", "github"].includes(sourceMode)) {
    return { error: "Choose a source for the audit." };
  }
  if (sourceMode === "sample" && !allowSampleSource()) {
    return { error: "The demo repository is disabled here. Upload a ZIP or connect a public repo." };
  }

  const intakeLimit = await consumeRateLimit(`intake:${user.id}`, 6, 60 * 60);
  if (!intakeLimit.allowed) {
    return {
      error: `You have queued several audits recently. Try again in ${Math.max(
        1,
        Math.ceil(intakeLimit.retryAfter / 60),
      )} minutes or contact your operator.`,
    };
  }

  const submittedRepoUrl = sourceMode === "github" ? field(formData, "repoUrl", 300) : null;
  const repoUrl =
    submittedRepoUrl ? validateRepositoryUrl(submittedRepoUrl) : null;
  if (sourceMode === "github" && !repoUrl) {
    return {
      error:
        "Enter an HTTPS GitHub or GitLab repository URL. Private GitHub repositories require a configured VibeCheck App installation.",
    };
  }
  const ciPolicyValue = field(formData, "ciFailurePolicy", 30);
  const ciFailurePolicy: CiFailurePolicy = (
    ["REPORT_ONLY", "BLOCK_HIGH", "BLOCK_ANY"] as const
  ).includes(ciPolicyValue as CiFailurePolicy)
    ? (ciPolicyValue as CiFailurePolicy)
    : "REPORT_ONLY";

  const intake = {
    stack: field(formData, "stack", 500),
    deploymentTarget: field(formData, "deploymentTarget", 500),
    compliance: field(formData, "compliance", 500),
    notes: field(formData, "notes", 3000),
  };

  let archiveBuffer: Buffer | null = null;
  if (sourceMode === "zip") {
    const archive = formData.get("archive");
    if (!(archive instanceof File) || archive.size === 0) {
      return { error: "Select a .zip archive of the repository." };
    }
    if (archive.size > 25 * 1024 * 1024) {
      return { error: "The archive must be smaller than 25 MB." };
    }
    archiveBuffer = Buffer.from(await archive.arrayBuffer());
  }

  const engagementId = randomUUID();
  const sourceKey = randomUUID();
  let sourcePath: string | null = null;
  let githubInstallationId: string | null = null;

  try {
    sourcePath = await newSourceDirectory(engagementId, sourceKey);

    if (sourceMode === "sample") {
      await copySampleRepository(sourcePath);
    } else if (sourceMode === "github") {
      let githubToken: string | undefined;
      const parsed = new URL(repoUrl!);
      if (
        isGitHubAppConfigured() &&
        (parsed.hostname === "github.com" || parsed.hostname === "www.github.com")
      ) {
        const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
        if (!owner || !repo) throw new Error("Invalid GitHub repository URL.");
        const installation = await installationTokenForRepository(owner, repo);
        githubToken = installation.token;
        githubInstallationId = installation.installationId;
        const connectedRepos = await db
          .select({ repoUrl: engagements.repoUrl })
          .from(engagements)
          .where(
            and(
              eq(engagements.sourceType, "GITHUB"),
              eq(engagements.githubInstallationId, githubInstallationId),
              ne(engagements.status, "CLOSED"),
            ),
          );
        if (
          connectedRepos.some(
            (connected) =>
              githubRepositoryKey(connected.repoUrl) ===
              githubRepositoryKey(repoUrl),
          )
        ) {
          throw new Error(
            "This repository is already connected to an active VibeCheck project for this GitHub App installation.",
          );
        }
      }
      await cloneRepository(repoUrl!, sourcePath, { githubToken });
    } else if (archiveBuffer) {
      await extractZip(archiveBuffer, sourcePath);
    }
    await assertSourceDirectory(sourcePath);
  } catch (error) {
    if (sourcePath) {
      await purgeSource(sourcePath).catch(() => undefined);
    }
    return {
      error:
        error instanceof Error ? error.message : "The source could not be ingested.",
    };
  }

  try {
    await db.insert(engagements).values({
      id: engagementId,
      orgId: user.orgId,
      createdById: user.id,
      name,
      repoUrl: sourceMode === "github" ? repoUrl : null,
      githubInstallationId,
      sourceType:
        sourceMode === "zip" ? "ZIP" : sourceMode === "github" ? "GITHUB" : "SAMPLE",
      tier: tierValue,
      ciFailurePolicy,
      status: "INTAKE",
      intake,
    });
  } catch (error) {
    if (sourcePath) await purgeSource(sourcePath).catch(() => undefined);
    console.error("engagement_insert_failed", error);
    return { error: "The engagement could not be created." };
  }

  if (!isFreeMode()) {
    try {
      const checkout = await runSimulatedCheckout({
        orgId: user.orgId,
        engagementId,
        tier: tierValue,
      });
      await writeAudit({
        actor: user,
        action: "billing.simulated_checkout",
        orgId: user.orgId,
        engagementId,
        detail: {
          tier: tierValue,
          amountCents: TIERS[tierValue].priceCents,
          invoiceId: checkout.invoiceId,
          subscriptionId: checkout.subscriptionId ?? null,
          mode: "test",
        },
      });
    } catch (error) {
      await db.delete(engagements).where(eq(engagements.id, engagementId));
      if (sourcePath) await purgeSource(sourcePath).catch(() => undefined);
      console.error("billing_simulation_failed", error);
      return { error: "Test-mode billing could not be initialized." };
    }
  }

  try {
    const scan = await createScanRun({
      engagementId,
      kind: "INITIAL",
      sourcePath: sourcePath!,
    });
    await writeAudit({
      actor: user,
      action: "engagement.created",
      orgId: user.orgId,
      engagementId,
      detail: {
        name,
        tier: tierValue,
        sourceMode,
        scanId: scan.id,
        intake,
        billingMode: billingMode(),
        scanExecution: scanExecution(),
      },
    });
    revalidatePath("/portal");
    if (scanExecution() === "inline") {
      after(async () => {
        try {
          await runScan(scan.id);
        } catch (error) {
          console.error("scan_failed", scan.id, error);
        }
      });
    }
  } catch (error) {
    if (sourcePath) await purgeSource(sourcePath).catch(() => undefined);
    await db
      .update(engagements)
      .set({ status: "SCAN_FAILED", updatedAt: new Date() })
      .where(eq(engagements.id, engagementId));
    console.error("scan_enqueue_failed", error);
    return { error: "The scan could not be queued. Please contact support." };
  }

  redirect(`/portal/audits/${engagementId}`);
}

export async function requestRescanAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const engagementId = field(formData, "engagementId", 64);
  const isClient =
    openAccess() || user.role === "CLIENT" || user.role === "DEVELOPER";
  const back = isClient
    ? `/portal/audits/${engagementId}`
    : `/analyst/engagements/${engagementId}`;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement || !canViewEngagement(user, engagement)) {
    redirectWithError(back, "Engagement not found.");
  }

  const rescanLimit = await consumeRateLimit(`rescan:${user.id}`, 10, 60 * 60);
  if (!rescanLimit.allowed) {
    redirectWithError(
      back,
      `Too many re-scans requested. Try again in ${Math.max(
        1,
        Math.ceil(rescanLimit.retryAfter / 60),
      )} minutes.`,
    );
  }

  if (isClient && !soloMode()) {
    const [finalReport] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.engagementId, engagementId),
          eq(reports.status, "FINAL"),
        ),
      )
      .orderBy(desc(reports.version))
      .limit(1);
    if (!engagement.termsAcceptedAt || !finalReport) {
      redirectWithError(back, "Accept the report terms before requesting a re-scan.");
    }
  }

  const [latestScan] = await db
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

  if (!latestScan?.sourcePath) {
    redirectWithError(
      back,
      "The source for this engagement was purged. Upload the repository again to re-scan.",
    );
  }

  try {
    await assertSourceDirectory(latestScan.sourcePath);
    const scan = await createScanRun({
      engagementId,
      kind: "RESCAN",
      sourcePath: latestScan.sourcePath,
    });
    await writeAudit({
      actor: user,
      action: "scan.rescan_requested",
      orgId: engagement.orgId,
      engagementId,
      detail: { scanId: scan.id, sequence: scan.sequence },
    });
    revalidatePath(back);
    if (scanExecution() === "inline") {
      after(async () => {
        try {
          await runScan(scan.id);
        } catch (error) {
          console.error("rescan_failed", scan.id, error);
        }
      });
    }
  } catch (error) {
    console.error("rescan_request_failed", error);
    redirectWithError(
      back,
      error instanceof Error ? error.message : "The re-scan could not be queued.",
    );
  }

  redirect(back);
}

export async function acceptTermsAction(formData: FormData): Promise<void> {
  const user = await requireClient();
  const engagementId = field(formData, "engagementId", 64);
  const back = `/portal/audits/${engagementId}`;

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement || !canViewEngagement(user, engagement)) {
    redirectWithError("/portal", "Engagement not found.");
  }

  const [finalReport] = await db
    .select()
    .from(reports)
    .where(
      and(eq(reports.engagementId, engagementId), eq(reports.status, "FINAL")),
    )
    .orderBy(desc(reports.version))
    .limit(1);
  if (!finalReport) {
    redirectWithError(back, "There is no finalized report to accept yet.");
  }
  if (field(formData, "acceptTerms", 10) !== "on") {
    redirectWithError(back, "You must accept the service terms before viewing the report.");
  }

  const now = new Date();
  await db
    .update(engagements)
    .set({
      termsAcceptedAt: now,
      termsAcceptedById: user.id,
      status: "DELIVERED",
      updatedAt: now,
    })
    .where(eq(engagements.id, engagementId));
  await db
    .update(reports)
    .set({ deliveredAt: now })
    .where(eq(reports.id, finalReport.id));
  await writeAudit({
    actor: user,
    action: "terms.accepted",
    orgId: engagement.orgId,
    engagementId,
    detail: {
      reportId: finalReport.id,
      reportVersion: finalReport.version,
      termsVersion: "terms-v1",
    },
  });
  revalidatePath(back);
  redirect(back);
}

export async function markRemediationAction(formData: FormData): Promise<void> {
  const user = await requireClient();
  const findingId = field(formData, "findingId", 64);
  const intent = field(formData, "intent", 20);
  const note = field(formData, "note", 1000);

  const [row] = await db
    .select({ finding: findings, engagement: engagements })
    .from(findings)
    .innerJoin(engagements, eq(engagements.id, findings.engagementId))
    .where(eq(findings.id, findingId))
    .limit(1);

  if (!row || !canViewEngagement(user, row.engagement)) {
    redirectWithError("/portal", "Finding not found.");
  }

  const back = `/portal/audits/${row.engagement.id}#finding-${findingId}`;
  if (!row.engagement.termsAcceptedAt && !soloMode()) {
    redirectWithError(back, "Accept the report terms before updating remediation.");
  }

  const [latestFinal] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.engagementId, row.engagement.id),
        eq(reports.status, "FINAL"),
      ),
    )
    .orderBy(desc(reports.version))
    .limit(1);
  if (!latestFinal || latestFinal.scanId !== row.finding.scanId) {
    redirectWithError(back, "This finding is not part of the current report.");
  }
  if (
    soloMode()
      ? row.finding.analystStatus === "DISMISSED"
      : row.finding.analystStatus !== "CONFIRMED"
  ) {
    redirectWithError(back, "This finding is not included in the current report.");
  }

  const remediated = intent === "remediate";
  const now = new Date();
  await db
    .update(findings)
    .set({
      clientStatus: remediated ? "REMEDIATED" : "OPEN",
      clientNote: note || null,
      remediatedAt: remediated ? now : null,
      updatedAt: now,
    })
    .where(eq(findings.id, findingId));

  if (remediated && row.engagement.status === "DELIVERED") {
    await db
      .update(engagements)
      .set({ status: "REMEDIATION", updatedAt: now })
      .where(eq(engagements.id, row.engagement.id));
  }

  await writeAudit({
    actor: user,
    action: remediated ? "remediation.marked" : "remediation.reopened",
    orgId: row.engagement.orgId,
    engagementId: row.engagement.id,
    detail: { findingId, note: note.slice(0, 300) },
  });
  revalidatePath(back);
  redirect(back);
}

export async function upgradeSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireClient();
  if (!user.orgId) redirectWithError("/portal/billing", "Organization missing.");
  if (isFreeMode()) {
    redirect("/portal/billing?free=1");
  }
  const engagementId = field(formData, "engagementId", 64) || null;

  if (engagementId) {
    const [engagement] = await db
      .select({ id: engagements.id, orgId: engagements.orgId })
      .from(engagements)
      .where(eq(engagements.id, engagementId))
      .limit(1);
    if (!engagement || engagement.orgId !== user.orgId) {
      redirectWithError("/portal/billing", "Engagement not found.");
    }
  }

  const [active] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.orgId, user.orgId),
        eq(subscriptions.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (active) {
    redirect("/portal/billing?already=1");
  }

  const checkout = await runSimulatedCheckout({
    orgId: user.orgId,
    engagementId,
    tier: "CONTINUOUS_MONITORING",
  });
  if (engagementId) {
    await db
      .update(engagements)
      .set({ tier: "CONTINUOUS_MONITORING", updatedAt: new Date() })
      .where(eq(engagements.id, engagementId));
  }
  await writeAudit({
    actor: user,
    action: "billing.subscription_upgraded",
    orgId: user.orgId,
    engagementId,
    detail: {
      invoiceId: checkout.invoiceId,
      subscriptionId: checkout.subscriptionId,
      amountCents: TIERS.CONTINUOUS_MONITORING.priceCents,
      mode: "test",
    },
  });
  revalidatePath("/portal/billing");
  redirect("/portal/billing?upgraded=1");
}
