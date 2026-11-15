import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  ListChecks,
  ShieldAlert,
} from "lucide-react";
import { db } from "@/db";
import {
  auditLogs,
  engagements,
  findings,
  organizations,
  reports,
  scanRuns,
} from "@/db/schema";
import { SeverityBadge, StatusBadge, TierBadge } from "@/components/badges";
import { ScanRefresher } from "@/components/scan-refresher";
import { requireStaff } from "@/lib/auth";
import { soloMode } from "@/lib/env";
import { relativeTime, SEVERITY_ORDER } from "@/lib/domain";
import { getLatestReport, getScanHistory } from "@/lib/queries";

export const metadata: Metadata = { title: "Review queue" };

// In solo mode, UNDER_REVIEW is replaced with RESULTS_READY - prioritized differently
const STATUS_PRIORITY: Record<string, number> = {
  UNDER_REVIEW: 0,
  RESULTS_READY: 1,
  SCAN_FAILED: 2,
  SCANNING: 3,
  READY_FOR_CLIENT: 4,
  DELIVERED: 5,
  REMEDIATION: 6,
  INTAKE: 7,
  CLOSED: 8,
};

export default async function AnalystQueuePage() {
  const user = await requireStaff();

  const rows = await db
    .select({ engagement: engagements, organization: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .orderBy(desc(engagements.updatedAt));

  const enriched = await Promise.all(
    rows.map(async ({ engagement, organization }) => {
      const history = await getScanHistory(engagement.id);
      const scan = history[0] ?? null;
      const report = await getLatestReport(engagement.id);
      return {
        engagement,
        organization,
        scan,
        report,
        active: scan?.status === "QUEUED" || scan?.status === "RUNNING",
      };
    }),
  );

  const scanIds = enriched
    .map((r) => r.scan?.id)
    .filter((id): id is string => Boolean(id));

  const allFindings =
    scanIds.length > 0
      ? await db.select().from(findings).where(inArray(findings.scanId, scanIds))
      : [];

  const findingsByScan = new Map<string, typeof allFindings>();
  for (const f of allFindings) {
    const list = findingsByScan.get(f.scanId) ?? [];
    list.push(f);
    findingsByScan.set(f.scanId, list);
  }

  const allFinalReports = await db.select().from(reports).where(eq(reports.status, "FINAL"));
  const engagementById = new Map(enriched.map((r) => [r.engagement.id, r.engagement]));
  const turnaroundDays: number[] = [];
  for (const report of allFinalReports) {
    const eng = engagementById.get(report.engagementId);
    if (!eng || !report.finalizedAt) continue;
    const days = (report.finalizedAt.getTime() - eng.createdAt.getTime()) / 86_400_000;
    if (days >= 0) turnaroundDays.push(days);
  }
  const avgTurnaround =
    turnaroundDays.length > 0
      ? (turnaroundDays.reduce((s, d) => s + d, 0) / turnaroundDays.length).toFixed(1)
      : "—";

  const triaged = allFindings.filter((f) => f.analystStatus !== "OPEN");
  const dismissed = triaged.filter((f) => f.analystStatus === "DISMISSED").length;
  const fpRate = triaged.length > 0 ? Math.round((dismissed / triaged.length) * 100) : 0;

  const needsReview = enriched
    .filter((r) => r.engagement.status === "UNDER_REVIEW")
    .sort((a, b) => a.engagement.updatedAt.getTime() - b.engagement.updatedAt.getTime());

  const scanning = enriched.filter((r) => r.active || r.engagement.status === "SCANNING");

  const sorted = [...enriched].sort((a, b) => {
    const p = (STATUS_PRIORITY[a.engagement.status] ?? 9) - (STATUS_PRIORITY[b.engagement.status] ?? 9);
    return p !== 0 ? p : b.engagement.updatedAt.getTime() - a.engagement.updatedAt.getTime();
  });

  const recentActivity = await db
    .select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mono-label">{user.name} / analyst desk</p>
          <h1 className="mt-1.5 font-serif text-[32px] leading-[1.05] tracking-[-0.03em] md:text-[38px]">
            {needsReview.length > 0
              ? `${needsReview.length} engagement${needsReview.length === 1 ? "" : "s"} need${needsReview.length === 1 ? "s" : ""} you.`
              : "Queue is clear."}
          </h1>
          <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">
            {soloMode() ? "Automated scanning finds candidates. Results are unlocked automatically." : "Automated scanning finds candidates. Your judgment makes them findings. Nothing reaches the developer without your sign-off."}
          </p>
        </div>
        <Link href="/analyst/rules" className="btn btn-secondary shrink-0">
          <ListChecks size={14} aria-hidden />
          Ruleset
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: needsReview.length > 0 ? "Needs review" : "Results ready",
            value: needsReview.length,
            accent: needsReview.length > 0,
            sub: needsReview.length ? "Oldest first below" : "Queue clear",
          },
          {
            label: "Scanning now",
            value: scanning.length,
            accent: false,
            sub: scanning.length ? "Auto-refresh on" : "None running",
          },
          {
            label: "Avg turnaround",
            value: `${avgTurnaround}d`,
            accent: false,
            sub: "Intake → final report",
          },
          {
            label: "FP rate",
            value: `${fpRate}%`,
            accent: false,
            sub: `${dismissed}/${triaged.length} dismissed`,
          },
        ].map(({ label, value, accent, sub }) => (
          <div
            key={label}
            className={`rounded-xl border p-4 ${accent ? "border-medium/30 bg-medium-soft" : "border-line bg-card"}`}
          >
            <p className="mono-label text-[8px]">{label}</p>
            <p className={`mt-2 font-serif text-[28px] leading-none tracking-[-0.03em] ${accent ? "text-medium" : ""}`}>
              {value}
            </p>
            <p className="mt-1 text-[10px] text-muted">{sub}</p>
          </div>
        ))}
      </div>

      {scanning.length > 0 && <ScanRefresher active className="hidden" />}

      <div className="grid gap-7 lg:grid-cols-[1fr_280px]">
        <div className="space-y-8">

          {/* Review queue */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="mono-label">Needs you now</p>
                <h2 className="mt-1 font-serif text-[22px] tracking-[-0.02em]">Review gate</h2>
              </div>
              <span className="font-mono text-[9px] text-muted">FR-10 enforced</span>
            </div>

            {needsReview.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-strong bg-card/60 px-5 py-10 text-center">
                <FileCheck2 size={20} className="mx-auto text-success" aria-hidden />
                <p className="mt-2 text-[13px] font-semibold">Nothing to review.</p>
                <p className="mt-1 text-[11.5px] text-muted">
                  New scans appear here when the automated pass completes.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsReview.map((row) => {
                  const scanFindings = row.scan ? findingsByScan.get(row.scan.id) ?? [] : [];
                  const open = scanFindings.filter((f) => f.analystStatus === "OPEN").length;
                  const confirmed = scanFindings.filter((f) => f.analystStatus === "CONFIRMED").length;
                  const dis = scanFindings.filter((f) => f.analystStatus === "DISMISSED").length;
                  const progress =
                    scanFindings.length === 0
                      ? 100
                      : Math.round(((confirmed + dis) / scanFindings.length) * 100);
                  const critical = scanFindings.filter(
                    (f) => f.severity === "CRITICAL" && f.analystStatus === "OPEN",
                  ).length;

                  return (
                    <Link
                      key={row.engagement.id}
                      href={`/analyst/engagements/${row.engagement.id}`}
                      className="finding-card flex flex-col gap-4 p-4 no-underline sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <TierBadge tier={row.engagement.tier} />
                          {critical > 0 && (
                            <span className="flex items-center gap-1 rounded-full border border-critical/20 bg-critical-soft px-2 py-0.5 font-mono text-[9px] text-critical">
                              <ShieldAlert size={9} aria-hidden />
                              {critical} critical open
                            </span>
                          )}
                        </div>
                        <p className="mt-2 font-serif text-[20px] leading-tight tracking-[-0.02em]">
                          {row.engagement.name}
                        </p>
                        <p className="mt-0.5 text-[10.5px] text-muted">
                          {row.organization.name} · scan #{row.scan?.sequence ?? "—"} · {row.scan?.filesScanned ?? 0} files · {relativeTime(row.engagement.updatedAt)}
                        </p>
                        <div className="mt-3">
                          <div className="flex justify-between text-[9.5px] text-muted">
                            <span>{confirmed} confirmed · {dis} dismissed · {open} open</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-deep">
                            <div
                              className="h-full rounded-full bg-forest transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                        <div className="text-right">
                          <p className="font-serif text-[28px] leading-none">{open}</p>
                          <p className="mono-label mt-0.5 text-[8px]">open</p>
                        </div>
                        <ArrowRight size={16} className="text-muted" aria-hidden />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* All engagements table */}
          <section>
            <div className="mb-4">
              <p className="mono-label">All engagements</p>
              <h2 className="mt-1 font-serif text-[22px] tracking-[-0.02em]">Portfolio</h2>
            </div>
            <div className="sheet overflow-x-auto">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Engagement</th>
                    <th>Developer</th>
                    <th>Status</th>
                    <th>Risk</th>
                    <th>Findings</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const scanFindings = row.scan ? findingsByScan.get(row.scan.id) ?? [] : [];
                    const openCount = scanFindings.filter((f) => f.analystStatus === "OPEN").length;
                    return (
                      <tr key={row.engagement.id}>
                        <td>
                          <Link
                            href={`/analyst/engagements/${row.engagement.id}`}
                            className="font-semibold hover:underline hover:underline-offset-2"
                          >
                            {row.engagement.name}
                          </Link>
                        </td>
                        <td className="text-[11.5px] text-muted">{row.organization.name}</td>
                        <td><StatusBadge status={row.engagement.status} /></td>
                        <td className="font-mono text-[11px]">
                          {row.scan?.score !== null && row.scan?.score !== undefined
                            ? `${row.scan.score} / ${row.scan.grade}`
                            : "—"}
                        </td>
                        <td className="text-[11px]">
                          {openCount > 0 ? (
                            <span className="text-medium">{openCount} open</span>
                          ) : scanFindings.length > 0 ? (
                            <span className="flex items-center gap-1 text-success">
                              <CheckCircle2 size={11} aria-hidden /> triaged
                            </span>
                          ) : "—"}
                        </td>
                        <td className="text-[10.5px] text-muted">
                          {relativeTime(row.engagement.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-3">
          <div className="sheet p-5">
            <p className="mono-label">Quality signal</p>
            <p className="mt-3 font-serif text-[34px] leading-none">{fpRate}%</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              of triaged findings dismissed as false positives. Lower is better — it means the rules are precise.
            </p>
            <div className="mt-3 border-t border-line pt-3 text-[10px] text-muted">
              {triaged.length} findings triaged total
            </div>
          </div>

          <div className="sheet p-5">
            <p className="mono-label mb-3">Rule coverage</p>
            <div className="space-y-2 text-[11px]">
              {[
                ["AI-code checks", "18"],
                ["MCP checks", "3"],
                ["Secret detectors", "6"],
                ["Dependency rules", "2"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-muted">{label}</span>
                  <span className="font-mono">{value}</span>
                </div>
              ))}
            </div>
            <Link
              href="/analyst/rules"
              className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold underline decoration-line-strong underline-offset-4"
            >
              Inspect all 29 <ArrowRight size={11} aria-hidden />
            </Link>
          </div>

          <div className="sheet p-5">
            <p className="mono-label mb-3">Recent activity</p>
            <div className="space-y-3">
              {recentActivity.length === 0 && (
                <p className="text-[11px] text-muted">No events yet.</p>
              )}
              {recentActivity.map((event) => (
                <div key={event.id} className="flex gap-2.5">
                  <span className="timeline-dot mt-1" />
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-semibold capitalize">
                      {event.action.replace(/[._]/g, " ")}
                    </p>
                    <p className="text-[9.5px] text-muted">
                      {event.actorEmail ?? "system"} · {relativeTime(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
