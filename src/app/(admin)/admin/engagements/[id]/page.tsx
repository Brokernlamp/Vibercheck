import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArchiveX,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  LockKeyhole,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { db } from "@/db";
import {
  auditLogs,
  engagements,
  findings,
  invoices,
  organizations,
  scanRuns,
} from "@/db/schema";
import {
  AnalystStatusBadge,
  SeverityBadge,
  StatusBadge,
  TierBadge,
} from "@/components/badges";
import { RiskDial } from "@/components/risk-dial";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";
import {
  closeEngagementAction,
  purgeEngagementSourcesAction,
} from "@/app/actions/admin";
import { requireAdmin } from "@/lib/auth";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  relativeTime,
  SEVERITY_ORDER,
} from "@/lib/domain";
import {
  getFindingsForScan,
  getReportsForEngagement,
  getScanHistory,
} from "@/lib/queries";
import { getReviewState } from "@/lib/review";
import { isUuid, TIERS } from "@/lib/domain";

export const metadata: Metadata = { title: "Engagement operations" };

function bytesLabel(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;

  const [row] = await db
    .select({ engagement: engagements, organization: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(engagements.id, id))
    .limit(1);
  if (!row) notFound();
  const engagement = row.engagement;

  const history = await getScanHistory(engagement.id);
  const latestScan = history[0] ?? null;
  const findings = latestScan
    ? await getFindingsForScan(latestScan.id)
    : [];
  const reports = await getReportsForEngagement(engagement.id);
  const latestFinal = reports.find((report) => report.status === "FINAL");
  const review = getReviewState(findings);
  const engagementInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.engagementId, engagement.id))
    .orderBy(desc(invoices.createdAt));
  const events = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.engagementId, engagement.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(20);
  const retainedSources = history.filter((scan) => scan.sourcePath).length;
  const intake = engagement.intake as Record<string, string>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden />
          Operations overview
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/analyst/engagements/${engagement.id}`}
            className="btn btn-secondary btn-sm"
          >
            <UserCheck size={12} aria-hidden />
            Analyst view
          </Link>
          {latestFinal && (
            <Link href={`/reports/${latestFinal.id}`} className="btn btn-primary btn-sm">
              <FileText size={12} aria-hidden />
              Open report v{latestFinal.version}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 md:flex-row md:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={engagement.status} />
            <TierBadge tier={engagement.tier} />
            <span className="font-mono text-[9px] text-muted">
              ENG-{engagement.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="mt-3 font-serif text-[38px] leading-[1.03] tracking-[-0.035em] md:text-[44px]">
            {engagement.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>{row.organization.name}</span>
            <span>Intake {formatDateTime(engagement.createdAt)}</span>
            <span>{TIERS[engagement.tier].label}</span>
            <span>
              {formatMoney(TIERS[engagement.tier].priceCents)}
              {TIERS[engagement.tier].cadence === "monthly" ? "/mo" : " one-time"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {engagement.status === "DELIVERED" || engagement.status === "REMEDIATION" ? (
            <form action={closeEngagementAction}>
              <input type="hidden" name="engagementId" value={engagement.id} />
              <SubmitButton variant="secondary" pendingLabel="Closing…">
                <CheckCircle2 size={13} aria-hidden />
                Close engagement
              </SubmitButton>
            </form>
          ) : null}
          <form action={purgeEngagementSourcesAction}>
            <input type="hidden" name="engagementId" value={engagement.id} />
            <SubmitButton
              variant="danger"
              pendingLabel="Purging…"
              className="btn"
            >
              <ArchiveX size={13} aria-hidden />
              Purge source ({retainedSources})
            </SubmitButton>
          </form>
        </div>
      </div>

      {(notice || error) && (
        <div className="mt-5 space-y-2">
          {error && <Notice message={error} tone="error" />}
          {notice && <Notice message={notice} />}
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sheet flex items-center gap-3 p-4">
          {latestScan?.score !== null && latestScan?.score !== undefined ? (
            <RiskDial
              score={latestScan.score}
              grade={latestScan.grade ?? "—"}
              size={88}
              label="Scan risk"
            />
          ) : (
            <div className="grid h-[88px] w-[88px] place-items-center rounded-full border border-line text-[10px] text-muted">
              No score
            </div>
          )}
          <div>
            <div className="mono-label">Latest scan</div>
            <div className="mt-1 text-[12px] font-semibold">
              {latestScan ? `#${latestScan.sequence}` : "—"}
            </div>
            <div className="text-[9.5px] text-muted">
              {latestScan?.status.toLowerCase() ?? "not started"}
            </div>
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Confirmed findings</div>
          <div className="mt-3 font-serif text-[28px] leading-none">
            {review.confirmed}
          </div>
          <div className="mt-1 text-[9.5px] text-muted">
            {review.dismissed} dismissed · {review.open} open
          </div>
          <div className="mt-2 flex gap-1">
            {SEVERITY_ORDER.map((severity) => {
              const count =
                findings.filter(
                  (finding) =>
                    finding.severity === severity &&
                    finding.analystStatus === "CONFIRMED",
                ).length ?? 0;
              return count > 0 ? (
                <span key={severity} className="font-mono text-[8px] text-muted">
                  <SeverityBadge severity={severity} dot={false} /> {count}
                </span>
              ) : null;
            })}
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Report versions</div>
          <div className="mt-3 font-serif text-[28px] leading-none">
            {reports.length}
          </div>
          <div className="mt-1 text-[9.5px] text-muted">
            {latestFinal ? `Latest final v${latestFinal.version}` : "No final yet"}
          </div>
          <div className="mt-2 font-mono text-[8.5px] text-muted">
            {engagement.termsAcceptedAt ? "TERMS ACCEPTED" : "TERMS PENDING"}
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Source retention</div>
          <div className="mt-3 font-serif text-[28px] leading-none">
            {retainedSources}/{history.length}
          </div>
          <div className="mt-1 text-[9.5px] text-muted">snapshots retained</div>
          <div className="mt-2 flex items-center gap-1 font-mono text-[8.5px] text-muted">
            <Database size={9} aria-hidden />
            {latestScan?.sourcePath ? "AVAILABLE" : "PURGED / NONE"}
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <section className="sheet overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="mono-label">Report versions</div>
              <LockKeyhole size={13} className="text-muted" aria-hidden />
            </div>
            <div className="overflow-x-auto">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Scan</th>
                    <th>Status</th>
                    <th>Finalized</th>
                    <th>Delivered</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[11.5px] text-muted">
                        No report yet. A draft is created when a scan completes.
                      </td>
                    </tr>
                  )}
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td className="font-mono text-[11px]">v{report.version}</td>
                      <td className="font-mono text-[10px] text-muted">
                        {history.find((scan) => scan.id === report.scanId)?.sequence
                          ? `#${history.find((scan) => scan.id === report.scanId)?.sequence}`
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`chip ${
                            report.status === "FINAL"
                              ? "border-success/20 bg-success-soft text-success"
                              : "border-medium/20 bg-medium-soft text-medium"
                          }`}
                        >
                          {report.status.toLowerCase()}
                        </span>
                      </td>
                      <td className="text-[10.5px] text-muted">
                        {formatDateTime(report.finalizedAt)}
                      </td>
                      <td className="text-[10.5px] text-muted">
                        {formatDateTime(report.deliveredAt)}
                      </td>
                      <td>
                        {report.status === "FINAL" ? (
                          <Link
                            href={`/reports/${report.id}`}
                            className="inline-flex items-center gap-1 text-[10.5px] font-semibold hover:underline"
                          >
                            View <ExternalLink size={10} aria-hidden />
                          </Link>
                        ) : (
                          <span className="text-[9.5px] text-muted">internal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sheet overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <div className="mono-label">Scans & source snapshots</div>
              <span className="font-mono text-[8.5px] text-muted">
                {history.length} total
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Files</th>
                    <th>Size</th>
                    <th>Result</th>
                    <th>Source</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((scan) => {
                    const comparison = scan.comparison as {
                      resolvedCount?: number;
                      newCount?: number;
                    } | null;
                    return (
                      <tr key={scan.id}>
                        <td className="font-mono text-[10.5px]">#{scan.sequence}</td>
                        <td className="text-[10.5px]">{scan.kind.toLowerCase()}</td>
                        <td className="text-[10.5px]">{scan.status.toLowerCase()}</td>
                        <td className="text-[10.5px]">{scan.filesScanned || "—"}</td>
                        <td className="text-[10.5px]">
                          {bytesLabel(scan.sourceBytes)}
                        </td>
                        <td className="text-[10.5px]">
                          {scan.score !== null
                            ? `${scan.score}/${scan.grade}`
                            : comparison
                              ? `${comparison.resolvedCount ?? 0} resolved`
                              : "—"}
                        </td>
                        <td>
                          <span
                            className={`chip ${
                              scan.sourcePath
                                ? "border-success/20 bg-success-soft text-success"
                                : "border-line bg-paper text-muted"
                            }`}
                          >
                            {scan.sourcePath ? "retained" : "purged"}
                          </span>
                        </td>
                        <td className="text-[9.5px] text-muted">
                          {formatDateTime(scan.finishedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="sheet p-5">
            <div className="flex items-center justify-between">
              <div className="mono-label">Billing</div>
              <span className="font-mono text-[8.5px] text-muted">SIMULATED</span>
            </div>
            {engagementInvoices.length === 0 ? (
              <p className="mt-3 text-[11.5px] text-muted">No invoice for this engagement.</p>
            ) : (
              <div className="mt-3 divide-y divide-line">
                {engagementInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]"
                  >
                    <span className="text-ink-soft">{invoice.description}</span>
                    <span className="font-mono">
                      {formatMoney(invoice.amountCents)} · {invoice.status.toLowerCase()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="mono-label">Audit trail</div>
                <h2 className="mt-1 font-serif text-[23px] tracking-[-0.025em]">
                  Who touched this engagement
                </h2>
              </div>
              <span className="font-mono text-[8.5px] text-muted">
                append-only · last 20
              </span>
            </div>
            <div className="sheet divide-y divide-line">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span className="timeline-dot mt-1.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-semibold capitalize">
                        {event.action.replace(/[._]/g, " ")}
                      </div>
                      <span className="font-mono text-[8.5px] text-muted">
                        {relativeTime(event.createdAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[9.5px] text-muted">
                      <span>{event.actorEmail ?? "system"}</span>
                      {event.actorRole && <span>· {event.actorRole}</span>}
                      <span>· {formatDateTime(event.createdAt)}</span>
                    </div>
                    {Object.keys(event.detail).length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[9px] text-muted">
                          detail
                        </summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-mono text-[8.5px] text-ink-soft">
                          {JSON.stringify(event.detail, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="sheet p-5">
            <div className="mono-label">Review state</div>
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full ${
                  engagement.reviewCompletedAt
                    ? "bg-success-soft text-success"
                    : "bg-medium-soft text-medium"
                }`}
              >
                {engagement.reviewCompletedAt ? (
                  <ShieldCheck size={15} aria-hidden />
                ) : (
                  <UserCheck size={15} aria-hidden />
                )}
              </span>
              <div>
                <div className="text-[11.5px] font-semibold">
                  {engagement.reviewCompletedAt ? "Signed off" : "Not signed off"}
                </div>
                <div className="text-[9.5px] text-muted">
                  {engagement.reviewCompletedAt
                    ? formatDateTime(engagement.reviewCompletedAt)
                    : "Report finalization blocked"}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
              <div>
                <div className="font-serif text-[20px] leading-none">{review.total}</div>
                <div className="mono-label mt-1 text-[7px]">total</div>
              </div>
              <div>
                <div className="font-serif text-[20px] leading-none">{review.confirmed}</div>
                <div className="mono-label mt-1 text-[7px]">confirmed</div>
              </div>
              <div>
                <div className="font-serif text-[20px] leading-none">{review.dismissed}</div>
                <div className="mono-label mt-1 text-[7px]">dismissed</div>
              </div>
            </div>
            {engagement.reviewNote && (
              <p className="mt-3 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
                {engagement.reviewNote}
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              {review.open > 0 && <AnalystStatusBadge status="OPEN" />}
              {review.confirmed > 0 && <AnalystStatusBadge status="CONFIRMED" />}
            </div>
          </div>

          <div className="sheet p-5">
            <div className="mono-label">Terms & delivery</div>
            <dl className="mt-3 space-y-2 text-[10.5px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Accepted</dt>
                <dd className="font-semibold">
                  {engagement.termsAcceptedAt
                    ? formatDate(engagement.termsAcceptedAt)
                    : "No"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Current report</dt>
                <dd className="font-semibold">
                  {latestFinal ? `v${latestFinal.version}` : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Delivered</dt>
                <dd className="font-semibold">
                  {latestFinal?.deliveredAt
                    ? formatDate(latestFinal.deliveredAt)
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="sheet p-5">
            <div className="mono-label">Intake</div>
            <dl className="mt-3 space-y-2 text-[10.5px]">
              {[
                ["Stack", intake.stack],
                ["Deployment", intake.deploymentTarget],
                ["Compliance", intake.compliance],
                ["Notes", intake.notes],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="mono-label text-[7.5px]">{label}</dt>
                  <dd className="mt-0.5 text-ink-soft">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="border border-critical/25 bg-critical-soft p-4">
            <div className="flex items-center gap-2 text-critical">
              <ArchiveX size={13} aria-hidden />
              <span className="text-[11px] font-semibold">Destructive action</span>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-critical/80">
              Purging source deletes every retained snapshot for this engagement.
              Reports and findings remain. A new upload is required to re-scan.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
