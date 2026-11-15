import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileText,
  GitBranch,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { db } from "@/db";
import { engagements, organizations } from "@/db/schema";
import {
  SeverityBadge,
  StatusBadge,
  TierBadge,
} from "@/components/badges";
import { RiskDial } from "@/components/risk-dial";
import { RiskTrend } from "@/components/risk-trend";
import { ScanRefresher } from "@/components/scan-refresher";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/ui";
import {
  acceptTermsAction,
  markRemediationAction,
  requestRescanAction,
} from "@/app/actions/engagements";
import { requireClient } from "@/lib/auth";
import { soloMode } from "@/lib/env";
import {
  formatDate,
  formatDateTime,
  isUuid,
  SEVERITY_ORDER,
  TIERS,
} from "@/lib/domain";
import {
  getFindingsForScan,
  getReportsForEngagement,
  getScanHistory,
} from "@/lib/queries";

export const metadata: Metadata = { title: "Project" };

const SERVICE_STEPS = [
  { key: "intake", label: "Intake", detail: "Scope captured" },
  { key: "scan", label: "Automated scan", detail: "Rules + dependencies" },
  { key: "review", label: "Analyst review", detail: "Human validation gate" },
  { key: "report", label: "Report delivery", detail: "Results unlocked" },
  { key: "remediation", label: "Remediation", detail: "Fix, verify, re-scan" },
];

const FREELANCER_STEPS = [
  { key: "intake", label: "Project added", detail: "Source captured" },
  { key: "scan", label: "Automated scan", detail: "Code + dependencies" },
  { key: "report", label: "Results", detail: "Review findings" },
  { key: "remediation", label: "Fix + verify", detail: "Re-scan your changes" },
];

function stageIndex(status: string, selfService: boolean): number {
  if (status === "INTAKE") return 0;
  if (status === "SCANNING" || status === "SCAN_FAILED") return 1;
  if (selfService) return status === "DELIVERED" ? 2 : 3;
  if (status === "UNDER_REVIEW") return 2;
  if (status === "READY_FOR_CLIENT" || status === "DELIVERED") return 3;
  return 4;
}

function duration(ms: number | null | undefined): string {
  if (!ms) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export default async function ClientEngagementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireClient();
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
  if (!row || row.engagement.orgId !== user.orgId) notFound();

  const engagement = row.engagement;
  const selfService = soloMode();
  const history = await getScanHistory(engagement.id);
  const latestScan = history[0] ?? null;
  const reports = await getReportsForEngagement(engagement.id);
  const finalReport = reports.find((report) => report.status === "FINAL") ?? null;
  const finalFindings = finalReport
    ? (await getFindingsForScan(finalReport.scanId)).filter((finding) =>
        selfService
          ? finding.analystStatus !== "DISMISSED"
          : finding.analystStatus === "CONFIRMED",
      )
    : [];
  const finalScan = finalReport
    ? history.find((scan) => scan.id === finalReport.scanId) ?? null
    : null;
  const active =
    latestScan?.status === "QUEUED" || latestScan?.status === "RUNNING";
  const skipTermsGate = soloMode();
  const awaitingAcceptance =
    engagement.status === "READY_FOR_CLIENT" && Boolean(finalReport) && !skipTermsGate;
  const reportUnlocked = Boolean(finalReport && (engagement.termsAcceptedAt || skipTermsGate));
  const remediated = finalFindings.filter(
    (finding) => finding.clientStatus === "REMEDIATED",
  ).length;
  const openFindings = finalFindings.length - remediated;
  const stage = stageIndex(engagement.status, selfService);
  const steps = selfService ? FREELANCER_STEPS : SERVICE_STEPS;
  const intake = engagement.intake as {
    stack?: string;
    deploymentTarget?: string;
    compliance?: string;
    notes?: string;
    detectedStack?: string;
  };
  const trend = reports
    .filter((report) => report.status === "FINAL")
    .map((report) => {
      const scan = history.find((item) => item.id === report.scanId);
      return scan?.score !== null && scan?.score !== undefined
        ? { sequence: scan.sequence, score: scan.score, grade: scan.grade ?? "—" }
        : null;
    })
    .filter(
      (point): point is { sequence: number; score: number; grade: string } =>
        point !== null,
    )
    .reverse();

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden />
          {selfService ? "My projects" : "All projects"}
        </Link>
        {active && <ScanRefresher active />}
      </div>

      <div className="flex flex-col justify-between gap-6 border-b border-line pb-7 md:flex-row md:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={engagement.status} />
            <TierBadge tier={engagement.tier} />
          </div>
          <h1 className="mt-3 font-serif text-[38px] leading-[1.03] tracking-[-0.035em] md:text-[46px]">
            {engagement.name}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
            <span>{row.organization.name}</span>
            <span>Started {formatDate(engagement.createdAt)}</span>
            {engagement.repoUrl && (
              <a
                href={engagement.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-ink"
              >
                <GitBranch size={11} aria-hidden />
                Repository
              </a>
            )}
            <span>{TIERS[engagement.tier].turnaround} target</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {reportUnlocked && finalReport && (
            <Link href={`/reports/${finalReport.id}`} className="btn btn-primary">
              <FileText size={14} aria-hidden />
              Open final report
            </Link>
          )}
          {reportUnlocked && !active && engagement.status !== "CLOSED" && (
            <form action={requestRescanAction}>
              <input type="hidden" name="engagementId" value={engagement.id} />
              <SubmitButton
                variant="secondary"
                pendingLabel="Queueing re-scan…"
                className="btn"
              >
                <RotateCcw size={13} aria-hidden />
                Request re-scan
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      {(notice || error) && (
        <div className="mt-5 space-y-2">
          {error && <Notice message={error} tone="error" />}
          {notice && <Notice message={notice} />}
        </div>
      )}

      {!skipTermsGate && awaitingAcceptance && finalReport && (
        <div className="mt-6 overflow-hidden rounded-xl border border-forest bg-forest text-paper">
          <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
            <div>
              <div className="mono-label flex items-center gap-2 text-lime">
                <LockKeyhole size={12} aria-hidden />
                Final report ready · v{finalReport.version}
              </div>
              <h2 className="mt-2 font-serif text-[28px] tracking-[-0.025em]">
                One acceptance step, then it is yours.
              </h2>
              <p className="mt-2 max-w-[620px] text-[12px] leading-relaxed text-[#afbfb0]">
                The report is finalized and immutable. Accept the service terms to
                unlock your copy, then track remediation finding by finding.
              </p>
              <form action={acceptTermsAction} className="mt-4">
                <input type="hidden" name="engagementId" value={engagement.id} />
                <label className="flex cursor-pointer items-start gap-2.5 text-[11.5px] leading-relaxed text-[#d5ded4]">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    required
                    className="mt-0.5 accent-[#c9f45b]"
                  />
                  <span>
                    I accept the{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      className="underline decoration-[#5f7265] underline-offset-2 hover:text-paper"
                    >
                      service terms and scope limitations
                    </Link>{" "}
                    on behalf of myself.
                  </span>
                </label>
                <SubmitButton
                  variant="lime"
                  pendingLabel="Unlocking report…"
                  className="mt-4"
                >
                  Accept & unlock report
                  <ArrowRight size={14} aria-hidden />
                </SubmitButton>
              </form>
            </div>
            {finalScan?.score !== null && finalScan?.score !== undefined && (
              <div className="rounded-lg border border-[#33433a] bg-[#162019] p-3">
                <RiskDial
                  score={finalScan.score}
                  grade={finalScan.grade ?? "—"}
                  size={126}
                  label="Final risk"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-7 grid gap-7 lg:grid-cols-[1fr_310px]">
        <div className="space-y-5">
          {active && (
            <section className="sheet p-6">
              <div className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-low-soft text-low">
                  <ScanRefresher active className="hidden" />
                  <Clock3 size={17} aria-hidden />
                </span>
                <div>
                  <div className="mono-label text-low">Scan in progress</div>
                  <h2 className="mt-1 font-serif text-[27px] tracking-[-0.025em]">
                    Reading the repository.
                  </h2>
                  <p className="mt-2 max-w-[560px] text-[12.5px] leading-relaxed text-muted">
                    {selfService
                      ? "The scanner is checking your source and dependencies. Your results will appear here when the scan finishes."
                      : "Source was ingested safely. The automated pass is running now; when it finishes, an analyst starts validating findings. This page updates itself. You will never see a draft report here."}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
                    <div className="rounded-md border border-line bg-paper px-3 py-2">
                      <div className="mono-label text-[8px]">Stage</div>
                      <div className="mt-0.5 font-semibold">Automated scan</div>
                    </div>
                    <div className="rounded-md border border-line bg-paper px-3 py-2">
                      <div className="mono-label text-[8px]">Target</div>
                      <div className="mt-0.5 font-semibold">
                        {TIERS[engagement.tier].turnaround}
                      </div>
                    </div>
                    <div className="rounded-md border border-line bg-paper px-3 py-2">
                      <div className="mono-label text-[8px]">Next</div>
                      <div className="mt-0.5 font-semibold">
                        {selfService ? "Review scan results" : "Analyst review"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {engagement.status === "SCAN_FAILED" && (
            <Notice
              message={
                selfService
                  ? "The automated scan could not complete. Your source snapshot is retained; try requesting a re-scan or upload the project again."
                  : "The automated scan could not complete. Your source snapshot is retained; contact support or ask your analyst to retry."
              }
              tone="error"
            />
          )}

          {!active && engagement.status === "UNDER_REVIEW" && !selfService && (
            <section className="sheet overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper px-5 py-3">
                <div className="flex items-center gap-2">
                  <UserCheck size={14} className="text-medium" aria-hidden />
                  <span className="text-[12px] font-semibold">
                    With an analyst now
                  </span>
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                  Draft findings are internal
                </span>
              </div>
              <div className="p-6">
                <h2 className="font-serif text-[29px] tracking-[-0.025em]">
                  {selfService
                    ? "Your scan results are ready."
                    : "Judgment is the step that takes time."}
                </h2>
                <p className="mt-2 max-w-[590px] text-[12.5px] leading-relaxed text-muted">
                  {selfService
                    ? "The scan is complete. Open the latest report to review detected issues and decide which fixes apply to your project."
                    : "The automated pass is complete. A human analyst is now confirming real issues, dismissing false positives, and writing remediation guidance. The report stays hidden until every finding has a decision and the review is signed off."}
                </p>
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {[
                    ["Scan complete", `${latestScan?.filesScanned ?? 0} files read`],
                    selfService
                      ? ["Review results", "Check findings and guidance"]
                      : ["Analyst review", "Confirm / dismiss / add"],
                    selfService
                      ? ["Report", "Available after scan"]
                      : ["Report", "Unlocks after sign-off"],
                  ].map(([title, detail], index) => (
                    <div
                      key={title}
                      className={`rounded-md border px-3 py-2.5 ${
                        index === 0
                          ? "border-success/20 bg-success-soft"
                          : "border-line bg-paper"
                      }`}
                    >
                      <div className="mono-label text-[8px]">0{index + 1}</div>
                      <div className="mt-1 text-[11.5px] font-semibold">{title}</div>
                      <div className="mt-0.5 text-[10px] text-muted">{detail}</div>
                    </div>
                  ))}
                </div>
                {finalReport && (
                  <div className="mt-5 border-t border-line pt-4 text-[11.5px] text-muted">
                    A previous finalized report remains available while this revision
                    is under review.{" "}
                    <Link
                      href={`/reports/${finalReport.id}`}
                      className="font-semibold text-ink underline decoration-line-strong underline-offset-4"
                    >
                      Open v{finalReport.version}
                    </Link>
                  </div>
                )}
              </div>
            </section>
          )}

          {!active &&
            selfService &&
            engagement.status === "UNDER_REVIEW" &&
            !finalReport && (
              <section className="sheet p-6">
                <div className="mono-label text-medium">Scan complete</div>
                <h2 className="mt-1 font-serif text-[26px] tracking-[-0.025em]">
                  Run a fresh self-service scan.
                </h2>
                <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted">
                  This project has an older scan that was waiting for analyst review.
                  Re-scan it to create a freelancer report with the current workflow.
                </p>
                <form action={requestRescanAction} className="mt-4">
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <SubmitButton
                    variant="primary"
                    pendingLabel="Queueing re-scan…"
                    className="btn"
                  >
                    <RotateCcw size={13} aria-hidden />
                    Run self-service scan
                  </SubmitButton>
                </form>
              </section>
            )}

          {reportUnlocked && finalReport && (
            <section className="sheet overflow-hidden">
              <div className="grid sm:grid-cols-[170px_1fr]">
                <div className="flex flex-col items-center justify-center gap-2 border-b border-line bg-paper p-5 sm:border-b-0 sm:border-r">
                  {finalScan?.score !== null && finalScan?.score !== undefined ? (
                    <RiskDial
                      score={finalScan.score}
                      grade={finalScan.grade ?? "—"}
                      size={112}
                      label="Final risk"
                    />
                  ) : (
                    <ShieldCheck size={30} className="text-muted" aria-hidden />
                  )}
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted">
                    Report v{finalReport.version}
                  </span>
                </div>
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="mono-label">Current final report</div>
                    <span className="font-mono text-[9px] text-muted">
                      Delivered {formatDate(finalReport.deliveredAt)}
                    </span>
                  </div>
                  <h2 className="mt-1.5 font-serif text-[27px] tracking-[-0.025em]">
                    {finalFindings.length === 0
                      ? selfService ? "No findings detected." : "No confirmed findings."
                      : `${finalFindings.length} ${selfService ? "potential finding" : "confirmed finding"}${
                          finalFindings.length === 1 ? "" : "s"
                        }.`}
                  </h2>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                    {openFindings > 0
                      ? `${openFindings} still open; ${remediated} marked as fixed. Re-scan to check whether they remain.`
                      : selfService
                        ? "All listed findings are marked fixed. Re-scan to check whether they remain."
                        : "Every confirmed finding is marked remediated. A re-scan will verify what changed in the code."}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {SEVERITY_ORDER.filter(
                      (severity) =>
                        (finalScan?.counts?.[severity] ?? 0) > 0,
                    ).map((severity) => (
                      <span key={severity} className="inline-flex items-center gap-1">
                        <SeverityBadge severity={severity} />
                        <span className="font-mono text-[9px] text-muted">
                          {finalScan?.counts?.[severity]}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={`/reports/${finalReport.id}`} className="btn btn-primary btn-sm">
                      <FileText size={12} aria-hidden />
                      Read the report
                    </Link>
                    {!active && engagement.status !== "CLOSED" && (
                      <form action={requestRescanAction}>
                        <input
                          type="hidden"
                          name="engagementId"
                          value={engagement.id}
                        />
                        <SubmitButton
                          variant="secondary"
                          size="sm"
                          pendingLabel="Queueing…"
                        >
                          <RotateCcw size={12} aria-hidden />
                          Re-scan
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
              {trend.length > 1 && (
                <div className="border-t border-line px-5 py-4">
                  <div className="mono-label mb-1">Delivered report trend</div>
                  <RiskTrend points={trend} />
                </div>
              )}
            </section>
          )}

          {reportUnlocked && finalFindings.length > 0 && (
            <section>
              <div className="mb-3.5 flex items-end justify-between">
                <div>
                  <div className="mono-label">{selfService ? "Fix tracker" : "Remediation tracker"}</div>
                  <h2 className="mt-1 font-serif text-[26px] tracking-[-0.025em]">
                    {selfService ? "Fix, then re-scan." : "Fix, then mark it."}
                  </h2>
                </div>
                <div className="text-right">
                  <div className="font-serif text-[24px] leading-none">
                    {remediated}/{finalFindings.length}
                  </div>
                  <div className="mono-label mt-1 text-[8px]">resolved</div>
                </div>
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                <div
                  className="h-full bg-success"
                  style={{
                    width: `${
                      finalFindings.length
                        ? Math.round((remediated / finalFindings.length) * 100)
                        : 100
                    }%`,
                  }}
                />
              </div>

              {openFindings === 0 && (
                <Notice
                  message={
                    selfService
                      ? "All findings are marked fixed. Re-scan to verify the changes against the code."
                      : "All confirmed findings are marked remediated. Request a re-scan to verify the fixes against the code."
                  }
                  tone="success"
                  className="mb-3"
                />
              )}

              <div className="space-y-2.5">
                {finalFindings.map((finding) => {
                  const resolved = finding.clientStatus === "REMEDIATED";
                  return (
                    <article
                      key={finding.id}
                      id={`finding-${finding.id}`}
                      className={`sheet overflow-hidden ${
                        resolved ? "opacity-80" : ""
                      }`}
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
                                  : "bg-low"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <SeverityBadge severity={finding.severity} />
                            {!selfService && finding.analystPriority && (
                              <span className="chip">{finding.analystPriority}</span>
                            )}
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold">
                              {resolved ? (
                                <>
                                  <CheckCircle2 size={11} className="text-success" aria-hidden />
                                  <span className="text-success">Remediated</span>
                                </>
                              ) : (
                                <>
                                  <CircleAlert size={11} className="text-medium" aria-hidden />
                                  <span className="text-medium">Open</span>
                                </>
                              )}
                            </span>
                          </div>
                          <h3 className="mt-2 text-[13.5px] font-semibold leading-snug">
                            {finding.analystTitle || finding.title}
                          </h3>
                          <div className="mt-1 font-mono text-[9.5px] text-muted">
                            {finding.filePath}:{finding.lineStart}
                          </div>
                          <details className="mt-2.5">
                            <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">
                              Remediation guidance
                            </summary>
                            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                              {finding.analystRemediation || finding.remediation}
                            </p>
                            {!selfService && finding.analystComment && (
                              <p className="mt-2 rounded border border-line bg-paper px-2.5 py-2 text-[11px] leading-relaxed text-ink-soft">
                                <span className="font-semibold">Analyst note:</span>{" "}
                                {finding.analystComment}
                              </p>
                            )}
                          </details>

                          <form
                            action={markRemediationAction}
                            className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center"
                          >
                            <input type="hidden" name="findingId" value={finding.id} />
                            <input
                              type="hidden"
                              name="intent"
                              value={resolved ? "reopen" : "remediate"}
                            />
                            {!resolved && (
                              <input
                                name="note"
                                className="field min-w-0 flex-1 py-1.5 text-[11px]"
                                placeholder="What changed? Commit, PR, or note (optional)"
                                maxLength={1000}
                              />
                            )}
                            {resolved && (
                              <span className="flex-1 text-[10.5px] text-muted">
                                {finding.clientNote || "Marked remediated."}
                                {finding.remediatedAt
                                  ? ` · ${formatDate(finding.remediatedAt)}`
                                  : ""}
                              </span>
                            )}
                            <SubmitButton
                              variant={resolved ? "ghost" : "secondary"}
                              size="sm"
                              pendingLabel="Saving…"
                            >
                              {resolved
                                ? "Reopen"
                                : selfService
                                  ? "Mark as fixed"
                                  : "Mark remediated"}
                            </SubmitButton>
                          </form>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          {history.length > 0 && (
            <section className="sheet overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-5 py-3">
                <div className="mono-label">Scan history</div>
                <span className="font-mono text-[9px] text-muted">
                  Retained source snapshot
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Scan</th>
                      <th>Kind</th>
                      <th>Status</th>
                      <th>Files</th>
                      <th>Result</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((scan) => {
                      const isFinalScan = scan.id === finalReport?.scanId;
                      return (
                        <tr key={scan.id}>
                          <td className="font-mono text-[11px]">#{scan.sequence}</td>
                          <td className="text-[11px]">{scan.kind.toLowerCase()}</td>
                          <td>
                            <span className="text-[11px]">{scan.status.toLowerCase()}</span>
                          </td>
                          <td className="text-[11px]">{scan.filesScanned || "—"}</td>
                          <td className="text-[11px]">
                            {isFinalScan && scan.score !== null
                              ? `${scan.score}/100 (${scan.grade})`
                              : scan.comparison
                                ? `${(scan.comparison as { resolvedCount?: number }).resolvedCount ?? 0} resolved · ${
                                    (scan.comparison as { newCount?: number }).newCount ?? 0
                                  } new`
                                : "Pending review"}
                          </td>
                          <td className="text-[10.5px] text-muted">
                            {formatDateTime(scan.finishedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-3">
          <div className="sheet p-5">
            <div className="mono-label">
              {selfService ? "Project progress" : "Engagement stage"}
            </div>
            <ol className="mt-4">
              {steps.map((step, index) => {
                const complete = index < stage;
                const current = index === stage;
                return (
                  <li key={step.key} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`grid h-6 w-6 place-items-center rounded-full border text-[9px] font-semibold ${
                          complete
                            ? "border-success bg-success text-white"
                            : current
                              ? "border-forest bg-forest text-lime"
                              : "border-line bg-paper text-muted"
                        }`}
                      >
                        {complete ? <Check size={11} aria-hidden /> : index + 1}
                      </span>
                      {index < steps.length - 1 && (
                        <span
                          className={`my-1 h-5 w-px ${
                            complete ? "bg-success" : "bg-line"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pb-2.5">
                      <div
                        className={`text-[11.5px] font-semibold ${
                          current ? "text-ink" : complete ? "text-ink-soft" : "text-muted"
                        }`}
                      >
                        {step.label}
                      </div>
                      <div className="text-[10px] text-muted">{step.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="sheet p-5">
            <div className="mono-label">Intake context</div>
            <dl className="mt-3 space-y-2.5 text-[11.5px]">
              <div>
                <dt className="mono-label text-[8px]">Stack</dt>
                <dd className="mt-0.5 text-ink-soft">
                  {intake.stack || intake.detectedStack || "Not provided"}
                  {!intake.stack && intake.detectedStack && (
                    <span className="ml-1.5 font-mono text-[9px] text-muted">(auto-detected)</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-[8px]">Deployment</dt>
                <dd className="mt-0.5 text-ink-soft">
                  {intake.deploymentTarget || "Not provided"}
                </dd>
              </div>
              <div>
                <dt className="mono-label text-[8px]">Compliance context</dt>
                <dd className="mt-0.5 text-ink-soft">
                  {intake.compliance || "None supplied"}
                </dd>
              </div>
              {intake.notes && (
                <div>
                  <dt className="mono-label text-[8px]">
                    {selfService ? "Project note" : "Analyst note"}
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-wrap text-muted">
                    {intake.notes}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="border border-dashed border-line-strong bg-card/60 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-success" aria-hidden />
              <span className="text-[11.5px] font-semibold">
                {selfService ? "About these scan results" : "What “finalized” means"}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {selfService
                ? "These results were produced by automated static checks and have not been human-reviewed. Automated scans can miss issues or flag false positives; verify each finding before relying on it."
                : "Every automated finding was confirmed or dismissed by an analyst. The report payload is then frozen for this version; later re-scans create a new version rather than rewriting history."}
            </p>
            {finalReport && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
                <UserCheck size={12} aria-hidden />
                v{finalReport.version} finalized {formatDateTime(finalReport.finalizedAt)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
