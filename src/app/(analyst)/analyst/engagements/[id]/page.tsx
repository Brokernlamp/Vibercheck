import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  CircleAlert,
  FileText,
  ListFilter,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { db } from "@/db";
import { auditLogs, engagements, organizations } from "@/db/schema";
import {
  AnalystStatusBadge,
  SeverityBadge,
  SourceBadge,
  StatusBadge,
  TierBadge,
} from "@/components/badges";
import { RiskDial } from "@/components/risk-dial";
import { RiskTrend } from "@/components/risk-trend";
import { ScanRefresher } from "@/components/scan-refresher";
import { SubmitButton } from "@/components/submit-button";
import { Notice, PathKindBadge } from "@/components/ui";
import {
  addFindingAction,
  bulkConfirmAction,
  completeReviewAction,
  finalizeReportAction,
  triageFindingAction,
} from "@/app/actions/review";
import { requestRescanAction } from "@/app/actions/engagements";
import { requireStaff } from "@/lib/auth";
import {
  OWASP_CATEGORIES,
  SEVERITY_ORDER,
  formatDateTime,
  isUuid,
  relativeTime,
  type Severity,
} from "@/lib/domain";
import {
  getFindingsForScan,
  getLatestReportForScan,
  getReportsForEngagement,
  getScanHistory,
} from "@/lib/queries";
import { canFinalizeReport, getReviewState } from "@/lib/review";
import type { ScanComparison } from "@/lib/report";
import { buildFinalSummary as buildSummary } from "@/lib/scan-service";

export const metadata: Metadata = { title: "Review engagement" };

function duration(ms: number | null | undefined): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export default async function AnalystEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const query = await searchParams;
  const notice = typeof query.notice === "string" ? query.notice : null;
  const error = typeof query.error === "string" ? query.error : null;
  const severityFilter =
    typeof query.severity === "string" &&
    SEVERITY_ORDER.includes(query.severity as Severity)
      ? (query.severity as Severity)
      : null;
  const statusFilter =
    typeof query.status === "string" &&
    ["all", "open", "confirmed", "dismissed"].includes(query.status)
      ? query.status
      : null;

  const [row] = await db
    .select({ engagement: engagements, organization: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(engagements.id, id))
    .limit(1);
  if (!row) notFound();

  const engagement = row.engagement;
  const history = await getScanHistory(engagement.id);
  const scan = history[0] ?? null;
  const findings = scan ? await getFindingsForScan(scan.id) : [];
  const report = scan ? await getLatestReportForScan(scan.id) : null;
  const reports = await getReportsForEngagement(engagement.id);
  const latestFinal = reports.find((item) => item.status === "FINAL") ?? null;
  const review = getReviewState(findings);
  const reportFinal = report?.status === "FINAL";
  const selectedStatus =
    statusFilter ?? (review.open > 0 ? "open" : "all");

  const filtered = findings.filter((finding) => {
    if (severityFilter && finding.severity !== severityFilter) return false;
    if (selectedStatus === "open") return finding.analystStatus === "OPEN";
    if (selectedStatus === "confirmed") return finding.analystStatus === "CONFIRMED";
    if (selectedStatus === "dismissed") return finding.analystStatus === "DISMISSED";
    return true;
  });

  const gate = canFinalizeReport({
    findings,
    reviewCompletedAt: engagement.reviewCompletedAt,
    reportStatus: report?.status ?? null,
    hasScan: scan?.status === "SUCCEEDED",
  });
  const comparison = (scan?.comparison as ScanComparison | null) ?? null;
  const trend = history
    .filter(
      (item) =>
        item.status === "SUCCEEDED" &&
        item.score !== null &&
        item.score !== undefined,
    )
    .reverse()
    .map((item) => ({
      sequence: item.sequence,
      score: item.score ?? 0,
      grade: item.grade ?? "—",
    }));

  let finalSummary = "";
  if (scan && scan.status === "SUCCEEDED" && report?.status === "DRAFT") {
    finalSummary = await buildSummary(
      engagement,
      row.organization.name,
      scan,
      findings,
    );
  }
  const active = scan?.status === "QUEUED" || scan?.status === "RUNNING";
  const recentEvents = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.engagementId, engagement.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(6);

  const queryFor = (nextStatus: string, nextSeverity: Severity | null = severityFilter) => {
    const params = new URLSearchParams();
    params.set("status", nextStatus);
    if (nextSeverity) params.set("severity", nextSeverity);
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/analyst"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden />
          Review queue
        </Link>
        <div className="flex items-center gap-2">
          {active && <ScanRefresher active />}
          {latestFinal && (
            <Link
              href={`/reports/${latestFinal.id}`}
              className="btn btn-ghost btn-sm"
            >
              <FileText size={12} aria-hidden />
              Latest final v{latestFinal.version}
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
          <h1 className="mt-3 font-serif text-[38px] leading-[1.03] tracking-[-0.035em] md:text-[46px]">
            {engagement.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>{row.organization.name}</span>
            <span>Intake {formatDateTime(engagement.createdAt)}</span>
            {scan && (
              <span>
                Scan {scan.sequence} · {scan.filesScanned} files ·{" "}
                {duration(scan.durationMs)}
              </span>
            )}
            {scan?.finishedAt && <span>Finished {relativeTime(scan.finishedAt)}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!active && scan && engagement.status !== "CLOSED" && (
            <form action={requestRescanAction}>
              <input type="hidden" name="engagementId" value={engagement.id} />
              <SubmitButton
                variant="secondary"
                pendingLabel="Queueing…"
                className="btn"
              >
                <RotateCcw size={13} aria-hidden />
                Re-scan
              </SubmitButton>
            </form>
          )}
          {reportFinal && report && (
            <Link href={`/reports/${report.id}`} className="btn btn-primary">
              <FileText size={14} aria-hidden />
              Open finalized report
            </Link>
          )}
        </div>
      </div>

      {(notice || error) && (
        <div className="mt-5 space-y-2">
          {error && <Notice message={error} tone="error" />}
          {notice && <Notice message={notice} />}
        </div>
      )}

      {engagement.status === "SCAN_FAILED" && (
        <Notice
          message={`The latest scan failed${scan?.error ? `: ${scan.error}` : "."} The source is retained if the scan was queued.`}
          tone="error"
          className="mt-5"
        />
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sheet flex items-center gap-4 p-4">
          {scan?.score !== null && scan?.score !== undefined ? (
            <RiskDial score={scan.score} grade={scan.grade ?? "—"} size={92} label="Draft risk" />
          ) : (
            <div className="grid h-[92px] w-[92px] place-items-center rounded-full border border-line text-center text-[10px] text-muted">
              {active ? "Scanning" : "No score"}
            </div>
          )}
          <div>
            <div className="mono-label">Current scan</div>
            <div className="mt-1 text-[12px] font-semibold">
              {scan ? `#${scan.sequence} / ${scan.status.toLowerCase()}` : "None"}
            </div>
            <div className="mt-0.5 text-[10px] text-muted">
              {scan ? `${scan.filesScanned} files reviewed` : "Awaiting scan"}
            </div>
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Review progress</div>
          <div className="mt-3 flex items-end justify-between">
            <div className="font-serif text-[30px] leading-none">
              {review.percent}%
            </div>
            <div className="text-right text-[10px] text-muted">
              {review.open} open
              <br />
              {review.total} total
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-deep">
            <div
              className={`h-full rounded-full ${
                review.triageComplete ? "bg-success" : "bg-forest"
              }`}
              style={{ width: `${review.percent}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-muted">
            <span>{review.confirmed} confirmed</span>
            <span>{review.dismissed} dismissed</span>
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Review sign-off</div>
          <div className="mt-3 flex items-center gap-2">
            <span
              className={`grid h-8 w-8 place-items-center rounded-full ${
                engagement.reviewCompletedAt
                  ? "bg-success-soft text-success"
                  : "bg-medium-soft text-medium"
              }`}
            >
              {engagement.reviewCompletedAt ? (
                <Check size={15} aria-hidden />
              ) : (
                <CircleAlert size={15} aria-hidden />
              )}
            </span>
            <div>
              <div className="text-[11.5px] font-semibold">
                {engagement.reviewCompletedAt ? "Signed off" : "Not signed off"}
              </div>
              <div className="text-[9.5px] text-muted">
                {engagement.reviewCompletedAt
                  ? formatDateTime(engagement.reviewCompletedAt)
                  : "Gate remains closed"}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[9.5px] leading-relaxed text-muted">
            Triage changes reset this sign-off.
          </div>
        </div>
        <div className="sheet p-4">
          <div className="mono-label">Report</div>
          <div className="mt-2 font-serif text-[24px] leading-none">
            {report ? `v${report.version}` : "—"}
          </div>
          <div className="mt-1 text-[10.5px] font-semibold capitalize text-ink-soft">
            {report?.status.toLowerCase() ?? "no draft"}
          </div>
          <div className="mt-2 text-[9.5px] leading-relaxed text-muted">
            {reports.length > 0
              ? `${reports.length} version${reports.length === 1 ? "" : "s"} in history`
              : "Finalization creates v1"}
          </div>
        </div>
      </div>

      {comparison && (
        <div className="mt-3 rounded-xl border border-low/20 bg-low-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={14} className="text-low" aria-hidden />
              <span className="text-[11.5px] font-semibold text-low">
                Re-scan comparison against scan {comparison.previousSequence}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 font-mono text-[9.5px] text-ink-soft">
              <span>{comparison.resolvedCount} resolved</span>
              <span>{comparison.newCount} new</span>
              <span>{comparison.outstandingCount} outstanding</span>
              <span>
                score {comparison.scoreDelta >= 0 ? "+" : ""}
                {comparison.scoreDelta}
              </span>
            </div>
          </div>
          {comparison.resolved.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {comparison.resolved.slice(0, 4).map((item) => (
                <span key={item.fingerprint} className="chip border-low/20 bg-white/60">
                  <CheckCircle2 size={10} className="text-success" aria-hidden />
                  {item.title}
                </span>
              ))}
              {comparison.resolved.length > 4 && (
                <span className="chip border-low/20 bg-white/60">
                  +{comparison.resolved.length - 4} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_310px]">
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="mono-label">Findings</div>
              <h2 className="mt-1 font-serif text-[25px] tracking-[-0.025em]">
                {filtered.length} shown
                <span className="ml-2 font-sans text-[11px] font-normal text-muted">
                  of {findings.length}
                </span>
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["all", "All"],
                ["open", `Needs review ${review.open}`],
                ["confirmed", `Confirmed ${review.confirmed}`],
                ["dismissed", `Dismissed ${review.dismissed}`],
              ].map(([key, label]) => (
                <Link
                  key={key}
                  href={queryFor(key)}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold no-underline ${
                    selectedStatus === key
                      ? "border-forest bg-forest text-lime"
                      : "border-line bg-card text-ink-soft"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <ListFilter size={12} className="text-muted" aria-hidden />
            <Link
              href={queryFor(selectedStatus, null)}
              className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] no-underline ${
                !severityFilter
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-card text-muted"
              }`}
            >
              ANY
            </Link>
            {SEVERITY_ORDER.map((severity) => (
              <Link
                key={severity}
                href={queryFor(selectedStatus, severity)}
                className={`rounded-full border px-2 py-0.5 font-mono text-[8.5px] no-underline ${
                  severityFilter === severity
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-card text-muted"
                }`}
              >
                {severity}
              </Link>
            ))}
          </div>

          {!scan && (
            <div className="rounded-xl border border-dashed border-line-strong bg-card/60 px-5 py-10 text-center text-[12px] text-muted">
              No scan has run yet.
            </div>
          )}

          {scan && findings.length === 0 && (
            <div className="rounded-xl border border-dashed border-line-strong bg-card/60 px-5 py-10 text-center">
              <ShieldCheck size={22} className="mx-auto text-success" aria-hidden />
              <div className="mt-2 text-[13px] font-semibold">No findings in this scan.</div>
              <p className="mt-1 text-[11.5px] text-muted">
                The analyst can still sign off and deliver a clean report.
              </p>
            </div>
          )}

          {filtered.length === 0 && findings.length > 0 && (
            <div className="rounded-xl border border-dashed border-line-strong bg-card/60 px-5 py-8 text-center text-[12px] text-muted">
              No findings match this filter.
            </div>
          )}

          <div className="space-y-2.5">
            {filtered.map((finding) => (
              <article
                key={finding.id}
                id={`finding-${finding.id}`}
                className="sheet overflow-hidden scroll-mt-6"
              >
                <div className="flex gap-3 p-4">
                  <span
                    className={`severity-rail ${
                      finding.severity === "CRITICAL"
                        ? "bg-critical"
                        : finding.severity === "HIGH"
                          ? "bg-high"
                          : finding.severity === "MEDIUM"
                            ? "bg-medium"
                            : finding.severity === "LOW"
                              ? "bg-low"
                              : "bg-info"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeverityBadge severity={finding.severity} />
                      <SourceBadge source={finding.source} />
                      <AnalystStatusBadge status={finding.analystStatus} />
                      {finding.analystPriority && (
                        <span className="chip">Priority {finding.analystPriority}</span>
                      )}
                      <span className="ml-auto font-mono text-[9px] text-muted">
                        {finding.confidence}% confidence
                      </span>
                    </div>
                    <h3 className="mt-2.5 text-[14px] font-semibold leading-snug">
                      {finding.analystTitle || finding.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9.5px] text-muted">
                      <span>
                        {finding.filePath}:{finding.lineStart}
                      </span>
                      <PathKindBadge filePath={finding.filePath} />
                      <span>·</span>
                      <span>
                        {finding.owasp} {OWASP_CATEGORIES[finding.owasp] ?? ""}
                      </span>
                      <span>·</span>
                      <span>{finding.ruleId}</span>
                    </div>

                    <p className="mt-3 text-[11.5px] leading-relaxed text-ink-soft">
                      {finding.analystDescription || finding.description}
                    </p>
                    {finding.snippet && (
                      <pre className="code-block mt-3">{finding.snippet}</pre>
                    )}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[10.5px] font-semibold text-muted">
                        Remediation & analyst context
                      </summary>
                      <div className="mt-2 space-y-2 rounded-lg border border-line bg-paper p-3 text-[11px] leading-relaxed text-ink-soft">
                        <p>
                          <span className="font-semibold">Remediation: </span>
                          {finding.analystRemediation || finding.remediation}
                        </p>
                        {finding.analystComment && (
                          <p>
                            <span className="font-semibold">Analyst note: </span>
                            {finding.analystComment}
                          </p>
                        )}
                        <p className="text-[10px] text-muted">
                          Triaged{" "}
                          {finding.triagedAt
                            ? formatDateTime(finding.triagedAt)
                            : "not yet"}
                          {finding.addedById ? " · analyst-added finding" : ""}
                        </p>
                      </div>
                    </details>

                    {!reportFinal && (
                      <form
                        action={triageFindingAction}
                        className="mt-4 border-t border-line pt-3"
                      >
                        <input type="hidden" name="findingId" value={finding.id} />
                        <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
                          <textarea
                            name="comment"
                            rows={2}
                            defaultValue={finding.analystComment ?? ""}
                            className="field text-[11.5px]"
                            placeholder="Analyst commentary (shown in the report)"
                            maxLength={2000}
                          />
                          <select
                            name="priority"
                            defaultValue={finding.analystPriority ?? ""}
                            className="field text-[11.5px]"
                          >
                            <option value="">No priority</option>
                            <option value="P0">P0 — now</option>
                            <option value="P1">P1 — this sprint</option>
                            <option value="P2">P2 — scheduled</option>
                            <option value="P3">P3 — backlog</option>
                          </select>
                        </div>
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[10px] font-semibold text-muted">
                            Edit developer-facing copy (optional)
                          </summary>
                          <div className="mt-2 space-y-2">
                            <input
                              name="overrideTitle"
                              defaultValue={finding.analystTitle ?? ""}
                              className="field text-[11.5px]"
                              placeholder="Override title — leave blank for original"
                              maxLength={240}
                            />
                            <textarea
                              name="overrideDescription"
                              defaultValue={finding.analystDescription ?? ""}
                              rows={2}
                              className="field text-[11.5px]"
                              placeholder="Override description — leave blank for original"
                            />
                            <textarea
                              name="overrideRemediation"
                              defaultValue={finding.analystRemediation ?? ""}
                              rows={2}
                              className="field text-[11.5px]"
                              placeholder="Override remediation — leave blank for original"
                            />
                          </div>
                        </details>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <SubmitButton
                            name="decision"
                            value="confirm"
                            variant="primary"
                            size="sm"
                            pendingLabel="Saving…"
                          >
                            <Check size={12} aria-hidden />
                            {finding.analystStatus === "CONFIRMED"
                              ? "Update confirmation"
                              : "Confirm finding"}
                          </SubmitButton>
                          <SubmitButton
                            name="decision"
                            value="dismiss"
                            variant="secondary"
                            size="sm"
                            pendingLabel="Saving…"
                          >
                            Dismiss / false positive
                          </SubmitButton>
                          {finding.analystStatus !== "OPEN" && (
                            <SubmitButton
                              name="decision"
                              value="reopen"
                              variant="ghost"
                              size="sm"
                              pendingLabel="Saving…"
                            >
                              Reopen
                            </SubmitButton>
                          )}
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          {active ? (
            <div className="sheet p-5">
              <div className="mono-label text-low">Scan running</div>
              <h2 className="mt-2 font-serif text-[24px] leading-tight">
                Reading the snapshot.
              </h2>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                The queue will refresh automatically. No review actions are
                available until the automated pass completes.
              </p>
              <div className="mt-4">
                <ScanRefresher active />
              </div>
            </div>
          ) : reportFinal ? (
            <div className="sheet border-success/30 bg-success-soft p-5">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 size={16} aria-hidden />
                <span className="text-[12px] font-semibold">Finalized & immutable</span>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-success/90">
                This scan&apos;s report is final. Triage actions are disabled. Run a
                new scan to review changes and produce the next version.
              </p>
              {report && (
                <Link
                  href={`/reports/${report.id}`}
                  className="btn btn-primary btn-sm mt-4"
                >
                  <FileText size={12} aria-hidden />
                  Open report v{report.version}
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="sheet p-5">
                <div className="flex items-center justify-between">
                  <div className="mono-label">Review gate</div>
                  <UserCheck size={15} className="text-muted" aria-hidden />
                </div>
                <div className="mt-3 flex items-end justify-between">
                  <div className="font-serif text-[30px] leading-none">
                    {review.percent}%
                  </div>
                  <div className="text-[10px] text-muted">
                    {review.open} open / {review.total} total
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                  <div
                    className={`h-full rounded-full ${
                      review.triageComplete ? "bg-success" : "bg-forest"
                    }`}
                    style={{ width: `${review.percent}%` }}
                  />
                </div>

                <form action={bulkConfirmAction} className="mt-4">
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label htmlFor="threshold" className="field-label text-[10.5px]">
                        Bulk confirm at/above confidence
                      </label>
                      <select
                        id="threshold"
                        name="threshold"
                        defaultValue="80"
                        className="field py-1.5 text-[11px]"
                      >
                        <option value="50">50%</option>
                        <option value="60">60%</option>
                        <option value="70">70%</option>
                        <option value="80">80%</option>
                        <option value="90">90%</option>
                        <option value="95">95%</option>
                      </select>
                    </div>
                    <SubmitButton variant="secondary" size="sm" pendingLabel="Confirming…">
                      Apply
                    </SubmitButton>
                  </div>
                </form>

                {engagement.reviewCompletedAt ? (
                  <div className="mt-4 rounded-lg border border-success/25 bg-success-soft px-3 py-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-success">
                      <CheckCircle2 size={12} aria-hidden />
                      Review signed off
                    </div>
                    <div className="mt-1 text-[9.5px] text-success/80">
                      {formatDateTime(engagement.reviewCompletedAt)}
                      {engagement.reviewNote ? " · note recorded" : ""}
                    </div>
                  </div>
                ) : (
                  <form action={completeReviewAction} className="mt-4 border-t border-line pt-4">
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <label htmlFor="reviewNote" className="field-label text-[10.5px]">
                      Sign-off note (optional)
                    </label>
                    <textarea
                      id="reviewNote"
                      name="reviewNote"
                      rows={2}
                      className="field text-[11px]"
                      placeholder="Confidence caveats, scope assumptions, or context for the developer."
                      maxLength={4000}
                    />
                    <SubmitButton
                      variant="primary"
                      size="sm"
                      className="mt-2 w-full"
                      pendingLabel="Signing off…"
                    >
                      <ShieldCheck size={12} aria-hidden />
                      Complete analyst review
                    </SubmitButton>
                    {!review.triageComplete && (
                      <p className="mt-1.5 text-[9.5px] leading-relaxed text-medium">
                        Every finding needs a decision before sign-off.
                      </p>
                    )}
                  </form>
                )}
              </div>

              {review.triageComplete && (engagement.reviewCompletedAt || gate.reasons.length === 0) && report?.status === "DRAFT" && (
                <div className="sheet border-forest/20 p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-medium" aria-hidden />
                    <div className="mono-label">Finalization</div>
                  </div>
                  <h2 className="mt-2 font-serif text-[23px] leading-tight">
                    Write the cover, freeze the report.
                  </h2>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                    This generates the immutable payload from confirmed findings.
                    The developer sees nothing until you finalize and they accept terms.
                  </p>
                  <form action={finalizeReportAction} className="mt-3">
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <label htmlFor="executiveSummary" className="field-label text-[10px]">
                      Executive summary
                    </label>
                    <textarea
                      id="executiveSummary"
                      name="executiveSummary"
                      rows={10}
                      defaultValue={finalSummary}
                      className="field text-[10.5px] leading-relaxed"
                      maxLength={12000}
                    />
                    {!gate.ok && (
                      <div className="mt-2 rounded border border-medium/25 bg-medium-soft px-2.5 py-2 text-[9.5px] leading-snug text-medium">
                        {gate.reasons.map((reason) => (
                          <div key={reason}>· {reason}</div>
                        ))}
                      </div>
                    )}
                    <SubmitButton
                      variant="primary"
                      size="sm"
                      className="mt-2 w-full"
                      pendingLabel="Finalizing…"
                    >
                      Finalize report v{report.version}
                      <ArrowRight size={12} aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              )}

              <details className="sheet p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="mono-label">Add analyst finding</span>
                  <Plus size={14} className="text-muted" aria-hidden />
                </summary>
                <form action={addFindingAction} className="mt-4 space-y-2.5">
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <div>
                    <label htmlFor="add-title" className="field-label text-[10px]">
                      Title
                    </label>
                    <input
                      id="add-title"
                      name="title"
                      className="field text-[11.5px]"
                      placeholder="Manual observation"
                      required
                      minLength={5}
                      maxLength={240}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="add-severity" className="field-label text-[10px]">
                        Severity
                      </label>
                      <select
                        id="add-severity"
                        name="severity"
                        className="field text-[11px]"
                        defaultValue="MEDIUM"
                      >
                        {SEVERITY_ORDER.map((severity) => (
                          <option key={severity} value={severity}>
                            {severity}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="add-owasp" className="field-label text-[10px]">
                        OWASP
                      </label>
                      <select
                        id="add-owasp"
                        name="owasp"
                        className="field text-[11px]"
                        defaultValue="A04"
                      >
                        {Object.entries(OWASP_CATEGORIES).map(([key, label]) => (
                          <option key={key} value={key}>
                            {key} — {label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_70px_70px] gap-2">
                    <input
                      name="filePath"
                      className="field text-[11px]"
                      placeholder="File path"
                    />
                    <input
                      name="lineStart"
                      type="number"
                      min={1}
                      className="field text-[11px]"
                      placeholder="Line"
                    />
                    <input
                      name="lineEnd"
                      type="number"
                      min={1}
                      className="field text-[11px]"
                      placeholder="End"
                    />
                  </div>
                  <textarea
                    name="description"
                    rows={2}
                    className="field text-[11px]"
                    placeholder="What is the issue and its impact?"
                    required
                    minLength={10}
                  />
                  <textarea
                    name="remediation"
                    rows={2}
                    className="field text-[11px]"
                    placeholder="Specific remediation guidance."
                    required
                    minLength={10}
                  />
                  <div className="grid grid-cols-[1fr_100px] gap-2">
                    <input
                      name="comment"
                      className="field text-[11px]"
                      placeholder="Analyst comment (optional)"
                    />
                    <select name="priority" className="field text-[11px]" defaultValue="">
                      <option value="">Priority</option>
                      <option value="P0">P0</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                    </select>
                  </div>
                  <SubmitButton variant="secondary" size="sm" pendingLabel="Adding…">
                    Add confirmed finding
                  </SubmitButton>
                </form>
              </details>
            </>
          )}

          <div className="sheet p-5">
            <div className="mono-label mb-2">Risk trend</div>
            <RiskTrend points={trend} width={260} height={60} />
          </div>

          <div className="sheet p-5">
            <div className="mono-label mb-3">Intake context</div>
            <dl className="space-y-2 text-[10.5px]">
              {(() => {
                const intake = engagement.intake as Record<string, string>;
                const stack = intake.stack || intake.detectedStack;
                const autoDetected = !intake.stack && !!intake.detectedStack;
                return [
                  { label: "Stack", value: stack, auto: autoDetected },
                  { label: "Deployment", value: intake.deploymentTarget, auto: false },
                  { label: "Compliance", value: intake.compliance, auto: false },
                  { label: "Notes", value: intake.notes, auto: false },
                ].map(({ label, value, auto }) => (
                  <div key={label}>
                    <dt className="mono-label text-[8px]">
                      {label}
                      {auto && <span className="ml-1.5 text-[7px] text-low">auto-detected</span>}
                    </dt>
                    <dd className="mt-0.5 text-ink-soft">{value || "—"}</dd>
                  </div>
                ));
              })()}
            </dl>
          </div>

          <div className="sheet p-5">
            <div className="mono-label mb-3">Engagement audit</div>
            <div className="space-y-2.5">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex gap-2">
                  <span className="timeline-dot mt-1" />
                  <div>
                    <div className="text-[9.5px] font-semibold capitalize">
                      {event.action.replace(/[._]/g, " ")}
                    </div>
                    <div className="text-[8.5px] text-muted">
                      {event.actorEmail ?? "system"} · {relativeTime(event.createdAt)}
                    </div>
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
