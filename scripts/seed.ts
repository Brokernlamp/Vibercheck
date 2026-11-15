import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  auditLogs,
  engagements,
  findings,
  invoices,
  organizations,
  reports,
  scanRuns,
  subscriptions,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/password";
import {
  copySampleRepository,
  newSourceDirectory,
} from "../src/lib/ingest";
import { createScanRun, runScan } from "../src/lib/scan-service";
import {
  buildExecutiveSummary,
  buildReportPayload,
} from "../src/lib/report";
import { isFreeMode } from "../src/lib/env";

loadEnvConfig(process.cwd());

const PASSWORDS = {
  analyst: "Analyst123!",
  admin: "Admin123!",
  client: "Client123!",
};

type Actor = { id: string; email: string; role: "ADMIN" | "ANALYST" | "CLIENT" };

async function main() {
  console.log("Resetting demo database…");
  await db.execute(
    sql`truncate table audit_logs, findings, reports, scan_runs, invoices, subscriptions, sessions, invites, password_reset_tokens, rate_limits, system_heartbeats, engagements, users, organizations restart identity cascade`,
  );

  const [analystHash, adminHash, clientHash] = await Promise.all([
    hashPassword(PASSWORDS.analyst),
    hashPassword(PASSWORDS.admin),
    hashPassword(PASSWORDS.client),
  ]);

  const acmeId = randomUUID();
  const northwindId = randomUUID();
  await db.insert(organizations).values([
    { id: acmeId, name: "My SaaS App", slug: "my-saas", plan: "NONE" },
    {
      id: northwindId,
      name: "Side Projects",
      slug: "side-projects",
      plan: isFreeMode() ? "NONE" : "MONITORING",
    },
  ]);

  const analystId = randomUUID();
  const adminId = randomUUID();
  const acmeClientId = randomUUID();
  const northwindClientId = randomUUID();
  await db.insert(users).values([
    {
      id: analystId,
      email: "analyst@vibecheck.dev",
      name: "Maya Chen",
      passwordHash: analystHash,
      role: "ANALYST",
      emailVerifiedAt: new Date(),
    },
    {
      id: adminId,
      email: "admin@vibecheck.dev",
      name: "Alex Rivera",
      passwordHash: adminHash,
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
    {
      id: acmeClientId,
      email: "developer@vibecheck.dev",
      name: "Jordan Lee",
      passwordHash: clientHash,
      role: "CLIENT",
      orgId: acmeId,
      emailVerifiedAt: new Date(),
    },
    {
      id: northwindClientId,
      email: "developer2@vibecheck.dev",
      name: "Priya Nair",
      passwordHash: clientHash,
      role: "CLIENT",
      orgId: northwindId,
      emailVerifiedAt: new Date(),
    },
  ]);

  const analyst: Actor = {
    id: analystId,
    email: "analyst@vibecheck.dev",
    role: "ANALYST",
  };
  const admin: Actor = {
    id: adminId,
    email: "admin@vibecheck.dev",
    role: "ADMIN",
  };
  const acmeClient: Actor = {
    id: acmeClientId,
    email: "developer@vibecheck.dev",
    role: "CLIENT",
  };

  const now = new Date();
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const engagementAId = randomUUID();
  const engagementBId = randomUUID();
  const engagementCId = randomUUID();

  await db.insert(engagements).values([
    {
      id: engagementAId,
      orgId: acmeId,
      createdById: acmeClientId,
      name: "Payments API",
      sourceType: "SAMPLE",
      tier: "FULL_AUDIT",
      status: "INTAKE",
      intake: {
        stack: "Express, Postgres, Stripe, MCP ops server",
        deploymentTarget: "Railway + Supabase",
        compliance: "Pre-SOC 2; handling payment data",
        notes:
          "Rewritten with Cursor over six weeks. Launch is in three weeks. Most worried about auth on generated admin routes and anything the MCP agent can reach.",
      },
      createdAt: daysAgo(14),
      updatedAt: daysAgo(2),
    },
    {
      id: engagementBId,
      orgId: acmeId,
      createdById: acmeClientId,
      name: "Storefront MVP",
      sourceType: "SAMPLE",
      tier: "QUICK_SCAN",
      status: "INTAKE",
      intake: {
        stack: "Express, React, Stripe",
        deploymentTarget: "Vercel + Supabase",
        compliance: "None yet",
        notes:
          "Storefront generated from a Lovable template. Need a fast pre-launch sanity check before connecting live payments.",
      },
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
    },
    {
      id: engagementCId,
      orgId: northwindId,
      createdById: northwindClientId,
      name: "Admin Dashboard",
      sourceType: "SAMPLE",
      tier: "CONTINUOUS_MONITORING",
      status: "INTAKE",
      intake: {
        stack: "Flask, Postgres, internal admin tools",
        deploymentTarget: "AWS ECS behind an ALB",
        compliance: "Client contract requires annual security evidence",
        notes:
          "Side project admin portal. Need ongoing review because new AI-generated admin screens keep getting added.",
      },
      createdAt: daysAgo(8),
      updatedAt: daysAgo(1),
    },
  ]);

  if (!isFreeMode()) {
    await db.insert(invoices).values([
      {
        orgId: acmeId,
        engagementId: engagementAId,
        kind: "ONE_TIME",
        tier: "FULL_AUDIT",
        description: "Full Audit (one-time) — simulated test payment",
        amountCents: 250000,
        status: "PAID",
        provider: "SIMULATED",
        providerRef: `sim_${randomUUID()}`,
        paidAt: daysAgo(14),
      },
      {
        orgId: acmeId,
        engagementId: engagementBId,
        kind: "ONE_TIME",
        tier: "QUICK_SCAN",
        description: "Quick Scan (one-time) — simulated test payment",
        amountCents: 39900,
        status: "PAID",
        provider: "SIMULATED",
        providerRef: `sim_${randomUUID()}`,
        paidAt: daysAgo(3),
      },
      {
        orgId: northwindId,
        engagementId: engagementCId,
        kind: "SUBSCRIPTION",
        tier: "CONTINUOUS_MONITORING",
        description: "Continuous Monitoring (monthly) — simulated test payment",
        amountCents: 49900,
        status: "PAID",
        provider: "SIMULATED",
        providerRef: `sim_${randomUUID()}`,
        paidAt: daysAgo(8),
        periodStart: daysAgo(8),
        periodEnd: new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000),
      },
    ]);
    await db.insert(subscriptions).values({
      orgId: northwindId,
      engagementId: engagementCId,
      tier: "CONTINUOUS_MONITORING",
      status: "ACTIVE",
      amountCents: 49900,
      currentPeriodEnd: new Date(now.getTime() + 22 * 24 * 60 * 60 * 1000),
      createdAt: daysAgo(8),
    });
  }

  const auditRows: Array<typeof auditLogs.$inferInsert> = [];
  for (const [engagement, org, actor, name] of [
    [engagementAId, acmeId, acmeClient, "Payments API"],
    [engagementBId, acmeId, acmeClient, "Storefront MVP"],
    [engagementCId, northwindId, acmeClient, "Admin Dashboard"],
  ] as const) {
    auditRows.push({
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      orgId: org,
      engagementId: engagement,
      action: "engagement.created",
      detail: { name, source: "sample" },
    });
    if (!isFreeMode()) {
      auditRows.push({
        actorId: actor.id,
        actorRole: actor.role,
        actorEmail: actor.email,
        orgId: org,
        engagementId: engagement,
        action: "billing.simulated_checkout",
        detail: { mode: "test", name },
      });
    }
  }
  await db.insert(auditLogs).values(auditRows);

  console.log("Scanning Payments API (scan 1)…");
  const sourceA1 = await newSourceDirectory(engagementAId, randomUUID());
  await copySampleRepository(sourceA1);
  const scanA1 = await createScanRun({
    engagementId: engagementAId,
    kind: "INITIAL",
    sourcePath: sourceA1,
  });
  await runScan(scanA1.id);

  console.log("Triaging scan 1…");
  await triageScan(scanA1.id, analyst, false);
  await completeReview(
    engagementAId,
    analyst,
    "Confirmed the generated-route auth gaps, SQL injection, committed secrets, permissive RLS, wildcard IAM, and MCP command execution. Dismissed login rate limiting as an edge-proxy control that is confirmed in the deployment runbook.",
    daysAgo(10),
  );
  const reportA1 = await finalizeSeedReport({
    engagementId: engagementAId,
    scanId: scanA1.id,
    reviewer: analyst,
    client: acmeClient,
    deliveredAt: daysAgo(9),
    finalizedAt: daysAgo(10),
  });
  console.log(`  finalized ${reportA1}`);

  console.log("Preparing remediated snapshot + one new regression (scan 2)…");
  const sourceA2 = await newSourceDirectory(engagementAId, randomUUID());
  await copySampleRepository(sourceA2);
  await fs.rm(path.join(sourceA2, "config.js"), { force: true });
  const serverPath = path.join(sourceA2, "server.js");
  const serverSource = await fs.readFile(serverPath, "utf8");
  await fs.writeFile(
    serverPath,
    serverSource.replace(
      "const result = eval(req.body.expression);",
      "const result = JSON.parse(req.body.expression);",
    ),
  );
  await fs.mkdir(path.join(sourceA2, "routes"), { recursive: true });
  await fs.writeFile(
    path.join(sourceA2, "routes", "new-admin.js"),
    `const express = require("express");
const { db } = require("../db");

const router = express.Router();

// Generated during the remediation sprint.
router.delete("/api/admin/sessions/:id", async (req, res) => {
  await db.query("DELETE FROM sessions WHERE id = $1", [req.params.id]);
  res.json({ revoked: true });
});

module.exports = router;
`,
  );

  const scanA2 = await createScanRun({
    engagementId: engagementAId,
    kind: "RESCAN",
    sourcePath: sourceA2,
  });
  await runScan(scanA2.id);
  await triageScan(scanA2.id, analyst, true);
  await completeReview(
    engagementAId,
    analyst,
    "Re-scan confirms the SendGrid key and eval path were removed. One regression: the new admin session-revocation route was generated without an authorization guard. Confirmed and added to the remediation plan.",
    daysAgo(2),
  );
  const reportA2 = await finalizeSeedReport({
    engagementId: engagementAId,
    scanId: scanA2.id,
    reviewer: analyst,
    client: acmeClient,
    deliveredAt: daysAgo(1),
    finalizedAt: daysAgo(2),
  });
  console.log(`  finalized ${reportA2}`);

  // Acme's delivered findings: mark the two genuine fixes as resolved in the
  // portal so the remediation tracker is not empty on first login.
  const finalFindings = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanA2.id));
  const remediateRules = ["AI-CORS-001", "AI-JWT-001"];
  let markedRemediated = 0;
  for (const finding of finalFindings) {
    if (
      finding.analystStatus === "CONFIRMED" &&
      remediateRules.includes(finding.ruleId) &&
      markedRemediated < 2
    ) {
      await db
        .update(findings)
        .set({
          clientStatus: "REMEDIATED",
          remediatedAt: daysAgo(1),
          clientNote:
            "Fixed in the remediation branch. Awaiting the next verification re-scan.",
        })
        .where(eq(findings.id, finding.id));
      markedRemediated += 1;
    }
  }

  console.log("Scanning Storefront MVP…");
  const sourceB = await newSourceDirectory(engagementBId, randomUUID());
  await copySampleRepository(sourceB);
  const scanB = await createScanRun({
    engagementId: engagementBId,
    kind: "INITIAL",
    sourcePath: sourceB,
  });
  await runScan(scanB.id);

  console.log("Scanning Admin Dashboard…");
  const sourceC = await newSourceDirectory(engagementCId, randomUUID());
  await copySampleRepository(sourceC);
  const scanC = await createScanRun({
    engagementId: engagementCId,
    kind: "INITIAL",
    sourcePath: sourceC,
  });
  await runScan(scanC.id);

  // Show a partially completed review on the agency engagement.
  const northwindFindings = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanC.id));
  const partial = northwindFindings
    .filter((finding) => finding.severity === "CRITICAL" && finding.analystStatus === "OPEN")
    .slice(0, 3);
  for (const finding of partial) {
    await db
      .update(findings)
      .set({
        analystStatus: "CONFIRMED",
        analystPriority: "P0",
        analystComment:
          "Confirmed on first pass. Fix before the next client demo; re-scan after the patch.",
        triagedById: analystId,
        triagedAt: daysAgo(1),
      })
      .where(eq(findings.id, finding.id));
    await db.insert(auditLogs).values({
      actorId: analystId,
      actorRole: "ANALYST",
      actorEmail: analyst.email,
      orgId: northwindId,
      engagementId: engagementCId,
      action: "finding.confirmed",
      detail: { findingId: finding.id, ruleId: finding.ruleId, severity: finding.severity },
    });
  }

  await db
    .update(scanRuns)
    .set({ finishedAt: daysAgo(13), startedAt: daysAgo(13) })
    .where(eq(scanRuns.id, scanA1.id));
  await db
    .update(scanRuns)
    .set({ finishedAt: daysAgo(2), startedAt: daysAgo(2) })
    .where(eq(scanRuns.id, scanA2.id));
  await db
    .update(reports)
    .set({ deliveredAt: daysAgo(9), finalizedAt: daysAgo(10) })
    .where(eq(reports.id, reportA1));
  await db
    .update(reports)
    .set({ deliveredAt: daysAgo(1), finalizedAt: daysAgo(2) })
    .where(eq(reports.id, reportA2));

  // Admin operator access event for the audit trail.
  await db.insert(auditLogs).values({
    actorId: admin.id,
    actorRole: "ADMIN",
    actorEmail: admin.email,
    orgId: acmeId,
    engagementId: engagementAId,
    action: "engagement.viewed",
    detail: { surface: "operator" },
  });

  console.log("\nSeed complete.");
  console.log("  analyst@vibecheck.dev / Analyst123!");
  console.log("  developer@vibecheck.dev / Client123!");
  console.log("  developer2@vibecheck.dev / Client123!");
  console.log("  admin@vibecheck.dev / Admin123!");
  console.log(
    `  Payments API: report v2 final, ${finalFindings.length} findings, delivered`,
  );

  // Clean up any stale temp dirs? Sources are intentionally retained for re-scan.
}

async function triageScan(
  scanId: string,
  analyst: Actor,
  onlyOpen: boolean,
): Promise<void> {
  const rows = await db.select().from(findings).where(eq(findings.scanId, scanId));
  const auditRows: Array<typeof auditLogs.$inferInsert> = [];
  const now = new Date();
  for (const finding of rows) {
    if (onlyOpen && finding.analystStatus !== "OPEN") continue;
    const dismissed = finding.ruleId === "AI-RATE-001";
    const priority = dismissed
      ? null
      : finding.severity === "CRITICAL"
        ? "P0"
        : finding.severity === "HIGH"
          ? "P1"
          : finding.severity === "MEDIUM"
            ? "P2"
            : "P3";
    const comment = dismissed
      ? "Login rate limiting is enforced at the edge proxy, confirmed in the deployment runbook. Automation cannot see that control."
      : finding.ruleId === "AI-SQL-001"
        ? "Confirmed against the route. Parameterize the query and add a regression test before launch."
        : finding.ruleId === "SEC-STRIPE-001"
          ? "Test-mode key, but still a committed credential. Rotate and purge history."
          : finding.ruleId === "MCP-CMD-001"
            ? "Confirmed. The MCP tool must never pass model-controlled arguments through a shell."
            : null;
    await db
      .update(findings)
      .set({
        analystStatus: dismissed ? "DISMISSED" : "CONFIRMED",
        analystPriority: priority,
        analystComment: comment,
        triagedById: analyst.id,
        triagedAt: now,
      })
      .where(eq(findings.id, finding.id));
    auditRows.push({
      actorId: analyst.id,
      actorRole: "ANALYST",
      actorEmail: analyst.email,
      orgId: null,
      engagementId: finding.engagementId,
      action: dismissed ? "finding.dismissed" : "finding.confirmed",
      detail: {
        findingId: finding.id,
        ruleId: finding.ruleId,
        severity: finding.severity,
        priority,
      },
    });
  }
  if (auditRows.length > 0) await db.insert(auditLogs).values(auditRows);
}

async function completeReview(
  engagementId: string,
  analyst: Actor,
  note: string,
  completedAt: Date,
): Promise<void> {
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) throw new Error("Engagement missing during seed");
  await db
    .update(engagements)
    .set({
      reviewCompletedAt: completedAt,
      reviewedById: analyst.id,
      reviewNote: note,
    })
    .where(eq(engagements.id, engagementId));
  await db.insert(auditLogs).values({
    actorId: analyst.id,
    actorRole: "ANALYST",
    actorEmail: analyst.email,
    orgId: engagement.orgId,
    engagementId,
    action: "review.completed",
    detail: { note },
    createdAt: completedAt,
  });
}

async function finalizeSeedReport({
  engagementId,
  scanId,
  reviewer,
  client,
  deliveredAt,
  finalizedAt,
}: {
  engagementId: string;
  scanId: string;
  reviewer: Actor;
  client: Actor;
  deliveredAt: Date;
  finalizedAt: Date;
}): Promise<string> {
  const [row] = await db
    .select({ engagement: engagements, org: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!row) throw new Error("Seed engagement missing");
  const [scan] = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.id, scanId))
    .limit(1);
  if (!scan) throw new Error("Seed scan missing");
  const scanFindings = await db
    .select()
    .from(findings)
    .where(eq(findings.scanId, scanId));
  const [report] = await db
    .select()
    .from(reports)
    .where(eq(reports.scanId, scanId))
    .limit(1);
  if (!report) throw new Error("Seed draft report missing");

  const summary = buildExecutiveSummary({
    engagement: row.engagement,
    organizationName: row.org.name,
    findings: scanFindings,
    dismissedCount: scanFindings.filter(
      (finding) => finding.analystStatus === "DISMISSED",
    ).length,
    filesScanned: scan.filesScanned,
    finishedAt: scan.finishedAt,
  });
  const payload = buildReportPayload({
    engagement: row.engagement,
    organization: row.org,
    scan,
    findings: scanFindings,
    version: report.version,
    executiveSummary: summary,
    analystNote: row.engagement.reviewNote,
  });

  await db
    .update(reports)
    .set({
      status: "FINAL",
      executiveSummary: summary,
      payload,
      finalizedById: reviewer.id,
      finalizedAt,
      deliveredAt,
    })
    .where(eq(reports.id, report.id));
  await db
    .update(engagements)
    .set({
      status: "DELIVERED",
      termsAcceptedAt: deliveredAt,
      termsAcceptedById: client.id,
      updatedAt: deliveredAt,
    })
    .where(eq(engagements.id, engagementId));

  await db.insert(auditLogs).values([
    {
      actorId: reviewer.id,
      actorRole: reviewer.role,
      actorEmail: reviewer.email,
      orgId: row.engagement.orgId,
      engagementId,
      action: "report.finalized",
      detail: {
        reportId: report.id,
        version: report.version,
        scanId,
        confirmed: scanFindings.filter((f) => f.analystStatus === "CONFIRMED").length,
        dismissed: scanFindings.filter((f) => f.analystStatus === "DISMISSED").length,
      },
      createdAt: finalizedAt,
    },
    {
      actorId: client.id,
      actorRole: client.role,
      actorEmail: client.email,
      orgId: row.engagement.orgId,
      engagementId,
      action: "terms.accepted",
      detail: { reportId: report.id, reportVersion: report.version, termsVersion: "terms-v1" },
      createdAt: deliveredAt,
    },
  ]);

  return report.id;
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
