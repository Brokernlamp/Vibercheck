import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { Logo } from "./logo";
import { PrintButton } from "./print-button";
import { SeverityBadge } from "./badges";
import { RiskDial } from "./risk-dial";
import { summaryParagraphs, type ReportPayload } from "@/lib/report";
import { AiPatchPromptActions } from "./ai-patch-prompt-actions";
import {
  OWASP_CATEGORIES,
  SEVERITY_ORDER,
  formatDate,
  formatDateTime,
} from "@/lib/domain";

export function ReportView({
  payload,
  backHref,
  backLabel,
  clientView,
}: {
  payload: ReportPayload;
  backHref: string;
  backLabel: string;
  clientView: boolean;
}) {
  const selfService = payload.reviewMode === "self-service";
  const counts = payload.counts;
  const maxCount = Math.max(1, ...SEVERITY_ORDER.map((severity) => counts[severity]));
  const owaspRows = Object.entries(OWASP_CATEGORIES)
    .map(([code, label]) => ({
      code,
      label,
      count: payload.findings.filter((finding) => finding.owasp === code).length,
    }))
    .filter((row) => row.count > 0);

  return (
    <div className="min-h-screen bg-paper print:bg-white">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-4 px-5 py-3.5">
          <Logo href="/" />
          <div className="flex items-center gap-3">
            {selfService && clientView && (
              <AiPatchPromptActions payload={payload} />
            )}
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.1em] text-muted sm:block">
              {selfService
                ? "Freelancer report"
                : clientView
                  ? "Client copy"
                  : "Analyst preview"} · confidential
            </span>
            <Link
              href={backHref}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-soft hover:text-ink"
            >
              <ArrowLeft size={12} aria-hidden />
              {backLabel}
            </Link>
            <PrintButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[980px] px-4 py-8 md:px-6 md:py-12 print:max-w-none print:p-0">
        <article className="report-sheet sheet overflow-hidden bg-card shadow-[0_20px_60px_-45px_rgba(18,23,20,0.55)] print:border-0 print:shadow-none">
          <div className="border-b-2 border-forest px-6 pb-7 pt-6 md:px-10 md:pt-9">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="mono-label">
                  {selfService ? "VibeCheck automated security scan" : "VibeCheck security review"}
                </div>
                <div className="mt-1 font-mono text-[9px] text-muted">
                  CONFIDENTIAL · REPORT V{payload.version} ·{" "}
                  {formatDate(payload.generatedAt)}
                </div>
              </div>
              <div className="stamp text-critical">Confidential</div>
            </div>

            <div className="mt-7 grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="chip">{payload.engagement.tierLabel}</span>
                  <span className="chip">
                    {payload.findings.length} {selfService ? "potential finding" : "confirmed finding"}
                    {payload.findings.length === 1 ? "" : "s"}
                  </span>
                </div>
                <h1 className="display text-[42px] md:text-[56px]">
                  {payload.engagement.name}
                </h1>
                <p className="mt-2 text-[12.5px] text-muted">
                  {selfService ? "Automated scan report for " : "Security audit report prepared for "}
                  <strong className="font-semibold text-ink">
                    {payload.organization.name}
                  </strong>
                </p>
              </div>
              <div className="flex items-end gap-4">
                <RiskDial
                  score={payload.score}
                  grade={payload.grade}
                  size={132}
                  label="Risk score"
                />
              </div>
            </div>

            <div className="mt-7 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[10px] sm:grid-cols-4">
              <div>
                <div className="mono-label text-[8px]">Report version</div>
                <div className="mt-1 font-semibold">v{payload.version}</div>
              </div>
              <div>
                <div className="mono-label text-[8px]">Scan</div>
                <div className="mt-1 font-semibold">
                  #{payload.scan.sequence} · {payload.scan.filesScanned} files
                </div>
              </div>
              <div>
                <div className="mono-label text-[8px]">Completed</div>
                <div className="mt-1 font-semibold">
                  {formatDate(payload.scan.finishedAt)}
                </div>
              </div>
              <div>
                <div className="mono-label text-[8px]">Engine</div>
                <div className="mt-1 font-mono text-[9px]">
                  {payload.scan.engineVersion}
                </div>
              </div>
              {payload.techStack && (
                <div className="mt-4 rounded-lg border border-line bg-paper px-4 py-3">
                  <div className="mono-label text-[8px]">Technology stack</div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                    {payload.techStack.detected
                      ? `Detected: ${payload.techStack.detected}`
                      : "No stack could be detected from the supplied source."}
                  </p>
                  {payload.techStack.declared && (
                    <p className="mt-1 text-[10px] leading-relaxed text-muted">
                      Supplied by project owner: {payload.techStack.declared}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="report-body px-6 py-8 md:px-10 md:py-10">
            <section id="summary">
              <div className="mono-label">01 / Executive summary</div>
              <div className="prose-audit mt-4">
                {summaryParagraphs(payload.executiveSummary).map(
                  (paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ),
                )}
              </div>
              {payload.analystNote && (
                <div className="mt-5 rounded-lg border border-line bg-paper px-4 py-3">
                  <div className="mono-label text-[8px]">Analyst sign-off note</div>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                    {payload.analystNote}
                  </p>
                </div>
              )}
            </section>

            <section className="mt-10 border-t border-line pt-8">
              <div className="mono-label">02 / Risk profile</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-5">
                {SEVERITY_ORDER.map((severity) => (
                  <div
                    key={severity}
                    className="rounded-lg border border-line bg-paper px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <SeverityBadge severity={severity} dot={false} />
                      <span className="font-serif text-[23px] leading-none">
                        {counts[severity]}
                      </span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                      <div
                        className={`h-full ${
                          severity === "CRITICAL"
                            ? "bg-critical"
                            : severity === "HIGH"
                              ? "bg-high"
                              : severity === "MEDIUM"
                                ? "bg-medium"
                                : severity === "LOW"
                                  ? "bg-low"
                                  : "bg-info"
                        }`}
                        style={{ width: `${(counts[severity] / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {owaspRows.length > 0 && (
                <div className="mt-5 overflow-x-auto">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>OWASP category</th>
                        <th>{selfService ? "Potential findings" : "Confirmed findings"}</th>
                        <th className="w-[45%]">Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owaspRows.map((row) => (
                        <tr key={row.code}>
                          <td>
                            <span className="font-mono text-[10px] text-muted">
                              {row.code}
                            </span>{" "}
                            <span className="text-[11.5px] font-medium">
                              {row.label}
                            </span>
                          </td>
                          <td className="font-mono text-[11px]">{row.count}</td>
                          <td>
                            <div className="h-1.5 max-w-[220px] overflow-hidden rounded-full bg-paper-deep">
                              <div
                                className="h-full bg-forest"
                                style={{
                                  width: `${(row.count / payload.findings.length) * 100}%`,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {payload.scan.comparison && (
                <div className="mt-5 rounded-lg border border-low/20 bg-low-soft p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11.5px] font-semibold text-low">
                      <CheckCircle2 size={13} aria-hidden />
                      Compared with scan {payload.scan.comparison.previousSequence}
                    </div>
                    <div className="flex flex-wrap gap-3 font-mono text-[9.5px] text-ink-soft">
                      <span>{payload.scan.comparison.resolvedCount} resolved</span>
                      <span>{payload.scan.comparison.newCount} new</span>
                      <span>{payload.scan.comparison.outstandingCount} outstanding</span>
                      <span>
                        score {payload.scan.comparison.scoreDelta >= 0 ? "+" : ""}
                        {payload.scan.comparison.scoreDelta}
                      </span>
                    </div>
                  </div>
                  {payload.scan.comparison.resolved.length > 0 && (
                    <ul className="mt-3 divide-y divide-low/10 border-t border-low/10">
                      {payload.scan.comparison.resolved.map((resolved) => (
                        <li
                          key={resolved.fingerprint}
                          className="flex items-center justify-between gap-3 py-1.5 text-[10.5px]"
                        >
                          <span className="inline-flex items-center gap-1.5 text-ink-soft">
                            <CheckCircle2 size={10} className="text-success" aria-hidden />
                            {resolved.title}
                          </span>
                          <span className="shrink-0 font-mono text-[8.5px] text-muted">
                            {resolved.filePath}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>

            <section className="print-break-before mt-10 border-t border-line pt-8">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="mono-label">
                    03 / {selfService ? "Potential findings" : "Confirmed findings"}
                  </div>
                  <h2 className="mt-1">What needs attention</h2>
                </div>
                <div className="text-right font-mono text-[9px] text-muted">
                  {payload.findings.length} items · severity ordered
                </div>
              </div>

              {payload.findings.length === 0 && (
                <div className="mt-5 rounded-lg border border-success/25 bg-success-soft px-5 py-6 text-center">
                  <ShieldCheck size={22} className="mx-auto text-success" aria-hidden />
                  <h3 className="mt-2 text-[14px] font-semibold text-success">
                    {selfService
                      ? "No potential findings detected."
                      : "No confirmed vulnerabilities in this review."}
                  </h3>
                  <p className="mx-auto mt-1 max-w-lg text-[11px] leading-relaxed text-success/80">
                    {selfService
                      ? "No enabled automated checks reported an issue. This is a scope-limited result, not a guarantee."
                      : "Automated findings were reviewed by the analyst and none met the confirmation bar. This is a scope-limited result, not a guarantee."}
                  </p>
                </div>
              )}

              <div className="mt-2">
                {payload.findings.map((finding, index) => (
                  <article
                    key={finding.id}
                    className="avoid-break border-t border-line py-6 first:border-t-0"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[9px] text-muted">
                        F-{String(index + 1).padStart(2, "0")}
                      </span>
                      <SeverityBadge severity={finding.severity} />
                      {!selfService && finding.analystPriority && (
                        <span className="chip">Priority {finding.analystPriority}</span>
                      )}
                      <span className="ml-auto font-mono text-[8.5px] text-muted">
                        {finding.confidence}% confidence
                      </span>
                    </div>
                    <h3 className="mt-2.5 text-[16px] leading-snug">{finding.title}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[9px] text-muted">
                      <span>
                        {finding.filePath}:{finding.lineStart}
                      </span>
                      <span>·</span>
                      <span>{finding.owasp} — {finding.owaspLabel}</span>
                      <span>·</span>
                      <span>{finding.ruleId}</span>
                    </div>

                    <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
                      {finding.description}
                    </p>

                    {finding.snippet && (
                      <pre className="code-block mt-3">{finding.snippet}</pre>
                    )}

                    <div className="mt-3 border-l-2 border-lime-deep bg-lime/10 px-3.5 py-2.5">
                      <div className="mono-label text-[8px] text-forest">
                        Remediation
                      </div>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
                        {finding.remediation}
                      </p>
                    </div>

                    {!selfService && finding.analystComment && (
                      <div className="mt-2.5 flex items-start gap-2 text-[10.5px] leading-relaxed text-muted">
                        <FileText size={11} className="mt-0.5 shrink-0" aria-hidden />
                        <span>
                          <strong className="font-semibold text-ink-soft">
                            Analyst:
                          </strong>{" "}
                          {finding.analystComment}
                        </span>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>

            <section className="mt-10 border-t border-line pt-8">
              <div className="mono-label">04 / Scope, methodology & limitations</div>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2">Methodology</h3>
                  <ul className="space-y-1.5">
                    {payload.methodology.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2">Limitations</h3>
                  <ul className="space-y-1.5">
                    {payload.limitations.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[11px] leading-relaxed text-muted"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-line-strong" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-line bg-paper p-4 text-[10.5px] leading-relaxed text-muted">
                <strong className="font-semibold text-ink">Report scope.</strong>{" "}
                {payload.disclaimer}
              </div>
            </section>

            <section className="mt-9 border-t border-line pt-6">
              {selfService ? (
                <p className="text-[11px] leading-relaxed text-muted">
                  Automated scan results · no human analyst review or sign-off.
                  Generated {formatDateTime(payload.generatedAt)} · report v
                  {payload.version}
                </p>
              ) : (
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <div className="mono-label">Review sign-off</div>
                  <div className="mt-1.5 text-[12px] font-semibold">
                    VibeCheck security analyst
                  </div>
                  <div className="text-[10px] text-muted">
                    Finalized {formatDateTime(payload.generatedAt)} · report v
                    {payload.version}
                  </div>
                  <div className="mt-3 h-px w-48 bg-line-strong" />
                  <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                    Signature on file · analyst review gate passed
                  </div>
                </div>
                <div className="text-right font-mono text-[8px] uppercase leading-relaxed tracking-[0.1em] text-muted">
                  {payload.engagement.id}
                  <br />
                  Generated by VibeCheck
                </div>
              </div>
              )}
            </section>
          </div>
        </article>

        <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-muted">
          <span>
            {clientView
              ? selfService
                ? "This is the immutable scan report. Later re-scans create new versions."
                : "This is the immutable developer copy. Later re-scans create new versions."
              : "Analyst preview of the finalized report payload."}
          </span>
          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em]">
            Confidential · {payload.organization.name}
          </span>
        </div>
      </main>
    </div>
  );
}
