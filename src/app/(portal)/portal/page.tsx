import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock,
  Plus,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { db } from "@/db";
import { engagements, subscriptions } from "@/db/schema";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { RiskDial } from "@/components/risk-dial";
import { ScanRefresher } from "@/components/scan-refresher";
import { Notice } from "@/components/ui";
import { requireClient } from "@/lib/auth";
import { isFreeMode, soloMode } from "@/lib/env";
import { formatDate, relativeTime, SEVERITY_ORDER, TIERS } from "@/lib/domain";
import {
  getFindingsForScan,
  getLatestFinalReport,
  getScanHistory,
} from "@/lib/queries";

export const metadata: Metadata = { title: "My projects" };

function statusStep(status: string, selfService: boolean): number {
  if (status === "INTAKE") return 0;
  if (status === "SCANNING" || status === "SCAN_FAILED") return 1;
  if (selfService) return status === "DELIVERED" ? 2 : 3;
  if (status === "UNDER_REVIEW") return 2;
  if (status === "READY_FOR_CLIENT") return 3;
  return 4;
}

function statusMessage(status: string, selfService: boolean): string {
  if (status === "INTAKE") return "Waiting to scan";
  if (status === "SCANNING") return "Scan running…";
  if (status === "UNDER_REVIEW") {
    return selfService ? "Scan complete" : "Analyst reviewing";
  }
  if (status === "READY_FOR_CLIENT") {
    return selfService ? "Your results are ready" : "Report ready — accept terms to unlock";
  }
  if (status === "DELIVERED") return selfService ? "Scan results ready" : "Report delivered";
  if (status === "REMEDIATION") return "Fixes in progress";
  if (status === "CLOSED") return "Closed";
  if (status === "SCAN_FAILED") return "Scan failed";
  return status;
}

export default async function PortalDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireClient();
  const freeMode = isFreeMode();
  const selfService = soloMode();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;

  if (!user.orgId) {
    return <Notice message="Your account is not linked to an organization." tone="error" />;
  }

  const orgEngagements = await db
    .select()
    .from(engagements)
    .where(eq(engagements.orgId, user.orgId))
    .orderBy(desc(engagements.createdAt));

  const rows = await Promise.all(
    orgEngagements.map(async (engagement) => {
      const history = await getScanHistory(engagement.id);
      const latestScan = history[0] ?? null;
      const finalReport = await getLatestFinalReport(engagement.id);
      const finalFindings = finalReport
        ? (await getFindingsForScan(finalReport.scanId)).filter((finding) =>
            selfService
              ? finding.analystStatus !== "DISMISSED"
              : finding.analystStatus === "CONFIRMED",
          )
        : [];
      const openFindings = finalFindings.filter((f) => f.clientStatus === "OPEN").length;
      const remediated = finalFindings.filter((f) => f.clientStatus === "REMEDIATED").length;
      const active = latestScan?.status === "QUEUED" || latestScan?.status === "RUNNING";
      return { engagement, latestScan, finalReport, finalFindings, openFindings, remediated, active };
    }),
  );

  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, user.orgId), eq(subscriptions.status, "ACTIVE")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const hasActive = rows.some((r) => r.active);
  const totalOpen = rows.reduce((s, r) => s + r.openFindings, 0);
  const totalFixed = rows.reduce((sum, row) => sum + row.remediated, 0);

  return (
    <div className="space-y-8">
      {(notice || error) && (
        <div className="space-y-2">
          {error && <Notice message={error} tone="error" />}
          {notice && <Notice message={notice} />}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mono-label">{user.orgName ?? "Freelancer"} / security workspace</p>
          <h1 className="mt-1.5 font-serif text-[32px] leading-[1.05] tracking-[-0.03em] md:text-[38px]">
            {rows.length === 0 ? "Scan your first project." : "Your projects."}
          </h1>
        </div>
        <Link href="/portal/new" className="btn btn-primary shrink-0">
          <Plus size={14} aria-hidden />
          {selfService ? "New scan" : "New project"}
        </Link>
      </div>

      {/* Summary strip — only when there's data */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: selfService ? "Projects" : "Audits", value: rows.length },
            {
              label: "Open findings",
              value: totalOpen,
              accent: totalOpen > 0,
            },
            {
              label: "Scans running",
              value: rows.filter((r) => r.active).length,
            },
            {
              label: selfService ? "Findings fixed" : "Plan",
              value: selfService
                ? totalFixed
                : freeMode
                  ? "Free"
                  : subscription
                    ? "Monitoring"
                    : "Audit",
            },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={`rounded-xl border p-4 ${
                accent
                  ? "border-high/30 bg-high-soft"
                  : "border-line bg-card"
              }`}
            >
              <p className="mono-label text-[8px]">{label}</p>
              <p
                className={`mt-2 font-serif text-[28px] leading-none tracking-[-0.03em] ${
                  accent ? "text-high" : ""
                }`}
              >
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {hasActive && <ScanRefresher active className="hidden" />}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-card/60 px-8 py-16 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-paper">
            <ShieldCheck size={24} className="text-muted" aria-hidden />
          </div>
          <h2 className="font-serif text-[24px] tracking-[-0.02em]">No projects yet.</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
            {selfService
              ? "Upload a ZIP or use a public repository URL. The scanner runs automatically, and you can review the findings as soon as it finishes."
              : "Paste a GitHub URL or upload a ZIP. The scanner runs in seconds. An analyst reviews every finding before anything reaches you."}
          </p>
          <Link href="/portal/new" className="btn btn-primary mt-6">
            Scan your first project
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      )}

      {/* Engagement list */}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => {
            const step = statusStep(row.engagement.status, selfService);
            const statusMsg = statusMessage(row.engagement.status, selfService);
            const tier = TIERS[row.engagement.tier];
            const hasReport =
              row.finalReport &&
              (row.engagement.termsAcceptedAt || selfService);
            const progress =
              row.finalFindings.length === 0
                ? 100
                : Math.round((row.remediated / row.finalFindings.length) * 100);

            return (
              <article key={row.engagement.id} className="finding-card">
                {/* Card header */}
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    {/* Status + tier */}
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.engagement.status} />
                      <span className="font-mono text-[9px] text-muted">{tier.label}</span>
                      {row.active && (
                        <span className="flex items-center gap-1.5 font-mono text-[9px] text-low">
                          <span className="pulse-dot" />
                          scanning
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <h2 className="mt-2.5 font-serif text-[22px] leading-tight tracking-[-0.02em]">
                      <Link
                        href={`/portal/audits/${row.engagement.id}`}
                        className="hover:underline hover:decoration-line-strong hover:underline-offset-4"
                      >
                        {row.engagement.name}
                      </Link>
                    </h2>

                    {/* Meta */}
                    <p className="mt-1 text-[11px] text-muted">
                      Started {formatDate(row.engagement.createdAt)}
                      {row.latestScan?.filesScanned
                        ? ` · ${row.latestScan.filesScanned.toLocaleString()} files`
                        : ""}
                      {row.latestScan?.durationMs
                        ? ` · ${row.latestScan.durationMs < 1000 ? `${row.latestScan.durationMs}ms` : `${(row.latestScan.durationMs / 1000).toFixed(1)}s`}`
                        : ""}
                    </p>

                    {/* Progress pipeline */}
                    <div className="mt-4 flex items-center gap-0">
                      {(selfService
                        ? ["Project", "Scan", "Results", "Fix + verify"]
                        : ["Intake", "Scan", "Review", "Report", "Remediation"]
                      ).map(
                        (label, i) => {
                          const done = i < step;
                          const current = i === step;
                          return (
                            <div key={label} className="flex items-center">
                              <div className="flex flex-col items-center gap-1">
                                <div
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    done
                                      ? "bg-success"
                                      : current
                                        ? "bg-forest"
                                        : "bg-line-strong"
                                  }`}
                                />
                                <span
                                  className={`font-mono text-[8px] ${
                                    current ? "text-ink font-semibold" : "text-muted"
                                  }`}
                                >
                                  {label}
                                </span>
                              </div>
                              {i < (selfService ? 3 : 4) && (
                                <div
                                  className={`mb-3 h-px w-8 sm:w-12 ${
                                    done ? "bg-success" : "bg-line"
                                  }`}
                                />
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>

                    {/* Status message */}
                    <p className="mt-3 text-[12px] text-ink-soft">{statusMsg}</p>

                    {/* Remediation bar */}
                    {row.finalFindings.length > 0 && hasReport && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-muted">
                          <span>{selfService ? "Fixes" : "Remediation"}</span>
                          <span>{row.remediated}/{row.finalFindings.length} resolved</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-paper-deep">
                          <div
                            className="h-full rounded-full bg-success transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* CTA */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {row.engagement.status === "READY_FOR_CLIENT" && !selfService ? (
                        <Link
                          href={`/portal/audits/${row.engagement.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          <Sparkles size={12} aria-hidden />
                          Accept & unlock report
                        </Link>
                      ) : hasReport ? (
                        <Link
                          href={`/reports/${row.finalReport!.id}`}
                          className="btn btn-primary btn-sm"
                        >
                          View report
                          <ArrowRight size={12} aria-hidden />
                        </Link>
                      ) : (
                        <Link
                          href={`/portal/audits/${row.engagement.id}`}
                          className="btn btn-secondary btn-sm"
                        >
                          {selfService ? "Open project" : "Open engagement"}
                          <ArrowRight size={12} aria-hidden />
                        </Link>
                      )}
                      {row.openFindings > 0 && hasReport && (
                        <span className="flex items-center gap-1 text-[11px] text-medium">
                          <CircleAlert size={11} aria-hidden />
                          {row.openFindings} open
                        </span>
                      )}
                      {row.openFindings === 0 && row.finalFindings.length > 0 && hasReport && (
                        <span className="flex items-center gap-1 text-[11px] text-success">
                          <CheckCircle2 size={11} aria-hidden />
                          All resolved
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Risk dial */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    {row.latestScan?.score !== null && row.latestScan?.score !== undefined ? (
                      <RiskDial
                        score={row.latestScan.score}
                        grade={row.latestScan.grade ?? "—"}
                        size={88}
                        label="Risk"
                      />
                    ) : (
                      <div className="grid h-[88px] w-[88px] place-items-center rounded-full border border-line bg-paper text-[10px] text-muted">
                        {row.active ? (
                          <span className="pulse-dot" />
                        ) : (
                          "No scan"
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Card footer — severity counts */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper/50 px-5 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    {SEVERITY_ORDER.filter(
                      (s) => (row.latestScan?.counts?.[s] ?? 0) > 0,
                    ).map((s) => (
                      <span key={s} className="flex items-center gap-1">
                        <SeverityBadge severity={s} dot={false} />
                        <span className="font-mono text-[9px] text-muted">
                          {row.latestScan?.counts?.[s]}
                        </span>
                      </span>
                    ))}
                    {!row.latestScan && (
                      <span className="flex items-center gap-1 text-[10px] text-muted">
                        <Clock size={10} aria-hidden />
                        Awaiting scan
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[9px] text-muted">
                    {relativeTime(row.engagement.updatedAt)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
