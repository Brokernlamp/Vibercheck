import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  CircleAlert,
  Fingerprint,
  GitPullRequest,
  KeyRound,
  ScanSearch,
  ShieldCheck,
  Terminal,
  UserCheck,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { SeverityBadge } from "@/components/badges";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { isFreeMode, openAccess, soloMode } from "@/lib/env";
import { APP_NAME, TIERS, TIER_ORDER, formatMoney } from "@/lib/domain";

export default async function LandingPage() {
  const user = await getCurrentUser();
  const freeMode = isFreeMode();
  const open = openAccess();
  const selfService = soloMode();
  const workspaceHref = user
    ? homeForRole(user.role)
    : open
      ? "/portal"
      : "/login";

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1220px] items-center justify-between px-5 py-3.5 md:px-8">
          <Logo />
          <nav className="hidden items-center gap-7 text-[12.5px] font-medium text-ink-soft md:flex">
            <a href="#failure" className="hover:text-ink">
              Why now
            </a>
            <a href="#method" className="hover:text-ink">
              Method
            </a>
            <a href="#pricing" className="hover:text-ink">
              {selfService ? "Pricing" : "Audits"}
            </a>
            <a href="#scope" className="hover:text-ink">
              Scope
            </a>
          </nav>
          <div className="flex items-center gap-3">
            {!user && !open && (
              <Link
                href="/login"
                className="hidden text-[12.5px] font-semibold text-ink-soft hover:text-ink sm:block"
              >
                Sign in
              </Link>
            )}
            <Link href={workspaceHref} className="btn btn-primary btn-sm">
              {user ? "Open workspace" : selfService ? "Start scanning" : "Book an audit"}
              <ArrowUpRight size={13} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="grid-paper border-b border-line">
          <div className="mx-auto grid max-w-[1220px] gap-12 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="mono-label flex items-center gap-2 text-ink-soft">
                <span className="h-1.5 w-1.5 bg-lime-deep" />
                {selfService
                  ? "Freelancer security workspace · AI-code era"
                  : "Productized security audit · AI-code era"}
              </div>
              <h1 className="display mt-6 max-w-[700px] text-[54px] md:text-[76px]">
                Your AI wrote
                <br />
                the code. Who is
                <br />
                <span className="relative inline-block">
                  checking it?
                  <span className="absolute -bottom-1 left-0 h-2 w-full -rotate-1 bg-lime -z-10" />
                </span>
              </h1>
              <p className="mt-7 max-w-[520px] text-[15px] leading-relaxed text-ink-soft">
                {selfService
                  ? "VibeCheck helps freelancers scan their AI-generated code for security risks. Review potential findings, fix issues in your project, and re-scan to check your changes. Results are automated and are not a substitute for a human security audit."
                  : "VibeCheck is a fixed-scope security audit for teams shipping AI-generated software. Automated AI-code checks find the usual failure modes. A human analyst confirms every finding before anything reaches your client."}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href={workspaceHref} className="btn btn-primary">
                  Start a Quick Scan
                  <ArrowRight size={15} aria-hidden />
                </Link>
                <a href="#method" className="btn btn-secondary">
                  See the method
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11.5px] text-muted">
                {(selfService
                  ? ["AI-code security checks", "Secrets + dependencies", "Re-scan to verify"]
                  : ["Fixed scope", "Human-reviewed", "48-hour Quick Scan"]
                ).map(
                  (item) => (
                    <span key={item} className="inline-flex items-center gap-1.5">
                      <Check size={13} className="text-success" aria-hidden />
                      {item}
                    </span>
                  ),
                )}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[470px] lg:max-w-none">
              <div className="absolute -right-3 -top-4 z-10 rotate-2 border border-forest bg-lime px-3 py-2 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-forest shadow-[3px_3px_0_#111a14]">
                {selfService ? "Automated scan · you review" : "Human reviewed · no auto-send"}
              </div>
              <div className="sheet overflow-hidden shadow-[0_24px_70px_-38px_rgba(18,23,20,0.55)]">
                <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-3">
                  <div>
                    <div className="mono-label text-[8px]">VibeCheck report</div>
                    <div className="mt-0.5 text-[12px] font-semibold">
                      Payments API
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-muted">v2 / FINAL</span>
                </div>
                <div className="grid grid-cols-[96px_1fr] gap-4 p-4">
                  <div className="grid place-items-center rounded-lg border border-line bg-paper py-3">
                    <div className="font-serif text-[40px] leading-none">78</div>
                    <div className="mono-label mt-1 text-[7px]">Risk / 100</div>
                    <div className="mt-1 rounded-sm bg-critical-soft px-2 py-0.5 font-mono text-[8px] font-semibold text-critical">
                      GRADE F
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      {
                        severity: "CRITICAL" as const,
                        title: "SQL query built from string construction",
                        file: "server.js:31",
                      },
                      {
                        severity: "CRITICAL" as const,
                        title: "Stripe live key committed to source",
                        file: ".env:2",
                      },
                      {
                        severity: "HIGH" as const,
                        title: "MCP server exposes tools without auth",
                        file: "mcp/server.js:1",
                      },
                      {
                        severity: "MEDIUM" as const,
                        title: "Generated CRUD route lacks auth guard",
                        file: "routes/admin.js:8",
                      },
                    ].map((finding) => (
                      <div
                        key={finding.title}
                        className="rounded-md border border-line bg-white px-2.5 py-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <SeverityBadge severity={finding.severity} />
                          <span className="font-mono text-[8px] text-muted">
                            {finding.file}
                          </span>
                        </div>
                        <div className="mt-1 text-[10.5px] font-medium leading-snug">
                          {finding.title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-line bg-paper px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[10px] text-muted">
                      <UserCheck size={13} className="text-success" aria-hidden />
                      {selfService ? "Automated scan results" : "Reviewed by M. Chen"}
                    </div>
                    <div className="stamp text-critical">Confidential</div>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full w-[78%] bg-critical" />
                  </div>
                </div>
              </div>
              <div className="mt-3 text-center font-mono text-[8.5px] uppercase tracking-[0.12em] text-muted">
                {selfService
                  ? "Illustrative report · no project data shown"
                  : "Illustrative report · no client data shown"}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-line bg-forest text-paper">
          <div className="mx-auto grid max-w-[1220px] gap-6 px-5 py-7 md:grid-cols-3 md:px-8">
            {[
              {
                stat: "~45%",
                text: "of AI-generated samples fail basic OWASP Top 10 checks",
              },
              {
                stat: "2×",
                text: "higher rate of committed secrets in AI-assisted commits",
              },
              {
                stat: "29",
                text: "named AI-code, MCP, secret, and dependency checks",
              },
            ].map((item) => (
              <div key={item.stat} className="flex items-start gap-4">
                <div className="min-w-[64px] font-serif text-[38px] leading-none text-lime">
                  {item.stat}
                </div>
                <p className="max-w-[260px] pt-1 text-[11.5px] leading-relaxed text-[#b9c5b9]">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-[#2b3a30] px-5 py-2.5 text-center font-mono text-[8px] uppercase tracking-[0.12em] text-[#7e9182] md:px-8">
            Industry research context: Veracode GenAI Code Security Report · Cloud
            Security Alliance · Georgia Tech Vibe Security Radar. Not customer
            claims.
          </div>
        </section>

        <section id="failure" className="border-b border-line">
          <div className="mx-auto max-w-[1220px] px-5 py-16 md:px-8 md:py-24">
            <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
              <div>
                <div className="mono-label">The failure mode</div>
                <h2 className="display mt-4 text-[42px] md:text-[52px]">
                  The same mistakes,
                  <br />
                  at machine speed.
                </h2>
                <p className="mt-5 max-w-[390px] text-[13.5px] leading-relaxed text-muted">
                  AI coding agents optimize for working code, not threat models.
                  These patterns show up repeatedly in generated applications —
                  and generic scanners often miss them or drown them in noise.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Terminal,
                    code: "AI-AUTH-001",
                    title: "Generated CRUD with no guard",
                    body: "A route exists, the demo works, and authorization was never wired in. The most expensive line of code is the one that is missing.",
                  },
                  {
                    icon: KeyRound,
                    code: "SEC-STRIPE-001",
                    title: "Secrets that ship",
                    body: "Environment files, test keys, and “temporary” defaults get committed while the app is still being scaffolded.",
                  },
                  {
                    icon: Bot,
                    code: "MCP-PERM-001",
                    title: "Agents with too much reach",
                    body: "MCP servers expose shell or filesystem tools broadly. Prompt injection turns a helpful assistant into an execution path.",
                  },
                  {
                    icon: GitPullRequest,
                    code: "AI-SQL-001",
                    title: "Queries assembled from strings",
                    body: "LLM output often concatenates request data directly into SQL. It works in the demo and fails in the threat model.",
                  },
                ].map((card) => (
                  <div key={card.code} className="sheet p-5">
                    <div className="flex items-center justify-between">
                      <span className="grid h-8 w-8 place-items-center rounded-md bg-paper-deep text-ink-soft">
                        <card.icon size={15} aria-hidden />
                      </span>
                      <span className="font-mono text-[8.5px] text-muted">{card.code}</span>
                    </div>
                    <h3 className="mt-5 text-[14px] font-semibold">{card.title}</h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                      {card.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="method" className="border-b border-line bg-paper-deep">
          <div className="mx-auto max-w-[1220px] px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mono-label">The method</div>
                <h2 className="display mt-4 max-w-[620px] text-[42px] md:text-[56px]">
                  Automated breadth.
                  <br />
                  {selfService ? "Your judgment." : "Human judgment."}
                </h2>
              </div>
              <p className="max-w-[330px] text-[13px] leading-relaxed text-muted">
                {selfService
                  ? "The scanner surfaces candidate issues. You decide what applies, make fixes in your code, then re-scan to verify."
                  : "One analyst can deliver several audits a week because the machine does the reading — not the deciding."}
              </p>
            </div>

            <div className="mt-10 grid gap-3 lg:grid-cols-4">
              {[
                {
                  step: "01",
                  icon: GitPullRequest,
                  title: "Ingest",
                  body: "Connect a public repository or upload a zip. Intake captures stack, deployment target, and compliance context.",
                },
                {
                  step: "02",
                  icon: ScanSearch,
                  title: "Scan",
                  body: "SAST-style AI-code rules, secret detection, dependency and license checks, plus MCP-specific review.",
                },
                {
                  step: "03",
                  icon: Fingerprint,
                  title: selfService ? "Review" : "Triage",
                  body: selfService
                    ? "Inspect candidate findings, validate them against your code, and prioritize the fixes that apply."
                    : "Every finding is confirmed, edited, dismissed, or supplemented. Bulk confidence actions reduce review time.",
                },
                {
                  step: "04",
                  icon: ShieldCheck,
                  title: selfService ? "Fix + verify" : "Deliver",
                  body: selfService
                    ? "Use the report and remediation guidance, update your code, and re-scan to compare results."
                    : "A finalized report with code evidence, OWASP mapping, and remediation. Re-scan verifies what actually changed.",
                },
              ].map((item) => (
                <div key={item.step} className="relative border border-line bg-card p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-muted">{item.step}</span>
                    <item.icon size={17} className="text-ink-soft" aria-hidden />
                  </div>
                  <h3 className="mt-7 font-serif text-[23px] tracking-[-0.02em]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col items-start justify-between gap-4 border border-forest bg-forest px-5 py-4 text-paper md:flex-row md:items-center">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lime text-forest">
                  {selfService ? (
                    <ScanSearch size={14} aria-hidden />
                  ) : (
                    <UserCheck size={14} aria-hidden />
                  )}
                </span>
                <div>
                  <div className="text-[13px] font-semibold">
                    {selfService ? "You stay in control of your audit." : "The gate is not configurable."}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-[#aebdaf]">
                    {selfService
                      ? "Scan reports are available immediately. Results are automated, so validate findings before acting on them."
                      : "No finalized report can reach a client until every finding has an analyst decision and sign-off."}
                  </div>
                </div>
              </div>
              <div className="stamp shrink-0 text-lime">
                {selfService ? "Automated · not human-reviewed" : "FR-10 enforced server-side"}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-b border-line">
          <div className="mx-auto max-w-[1220px] px-5 py-16 md:px-8 md:py-24">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="mono-label">{selfService ? "Freelancer pricing" : "Audit tiers"}</div>
                <h2 className="display mt-4 text-[42px] md:text-[56px]">
                  {selfService ? "Self-service." : "Fixed scope."}
                  <br />
                  {freeMode ? "Free in early access." : "Fixed price."}
                </h2>
              </div>
              <p className="max-w-[350px] text-[12.5px] leading-relaxed text-muted">
                {selfService
                  ? freeMode
                    ? "Run automated scans on your own projects. Free during early access — no card or invoice."
                    : "Run automated scans on your own projects with straightforward per-scan pricing."
                  : freeMode
                    ? "Productized engagements, not open-ended consulting hours. Every tier is free while we are in early access — no card, no invoice."
                    : "Productized engagements, not open-ended consulting hours. Fixed prices, no surprise hours."}
              </p>
            </div>
            {selfService ? (
              <div className="mt-10 grid gap-3 lg:grid-cols-[minmax(0,640px)]">
                <div className="sheet p-6 md:p-8">
                  <div className="mono-label">Freelancer workspace</div>
                  <h3 className="mt-3 font-serif text-[32px] tracking-[-0.03em]">
                    Scan your own projects.
                  </h3>
                  <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted">
                    Run automated checks, review potential findings, track fixes,
                    and compare re-scans. Results are not human-reviewed.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
                    <div>
                      <div className="font-serif text-[34px] leading-none">
                        {freeMode
                          ? "Free"
                          : formatMoney(TIERS.QUICK_SCAN.priceCents)}
                      </div>
                      <div className="mono-label mt-2 text-[8px]">
                        {freeMode ? "during early access" : "per scan · test mode"}
                      </div>
                    </div>
                    <Link href={workspaceHref} className="btn btn-primary">
                      Start scanning
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
            <div className="mt-10 grid gap-3 lg:grid-cols-3">
              {TIER_ORDER.map((tierKey, index) => {
                const tier = TIERS[tierKey];
                const highlight = tierKey === "FULL_AUDIT";
                return (
                  <div
                    key={tierKey}
                    className={`relative flex flex-col border p-6 ${
                      highlight
                        ? "border-forest bg-forest text-paper"
                        : "border-line bg-card text-ink"
                    }`}
                  >
                    {highlight && (
                      <span className="absolute -top-2.5 left-5 bg-lime px-2 py-1 font-mono text-[8px] font-semibold uppercase tracking-[0.1em] text-forest">
                        Most complete
                      </span>
                    )}
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-mono text-[9px] uppercase tracking-[0.12em] ${
                          highlight ? "text-[#9fb39f]" : "text-muted"
                        }`}
                      >
                        0{index + 1} / {tier.cadence}
                      </span>
                      {tierKey === "CONTINUOUS_MONITORING" && (
                        <span className="chip border-[#3a4a3f] bg-[#1e2b23] text-[#b9c9ba]">
                          recurring
                        </span>
                      )}
                    </div>
                    <h3 className="mt-5 font-serif text-[30px] tracking-[-0.03em]">
                      {tier.label}
                    </h3>
                    <p
                      className={`mt-1.5 min-h-[38px] text-[11.5px] leading-relaxed ${
                        highlight ? "text-[#aebdaf]" : "text-muted"
                      }`}
                    >
                      {tier.blurb}
                    </p>
                    <div className="mt-6 flex items-end gap-2">
                      <span className="font-serif text-[45px] leading-none">
                        {freeMode ? "Free" : formatMoney(tier.priceCents)}
                      </span>
                      <span
                        className={`pb-1 text-[10.5px] ${
                          highlight ? "text-[#9fb39f]" : "text-muted"
                        }`}
                      >
                        {freeMode
                          ? "during early access"
                          : tier.cadence === "monthly"
                            ? "/ month"
                            : "one-time"}
                      </span>
                    </div>
                    <div
                      className={`mt-1 text-[10.5px] ${
                        highlight ? "text-[#9fb39f]" : "text-muted"
                      }`}
                    >
                      Turnaround: {tier.turnaround}
                    </div>
                    <ul className="mt-6 flex-1 space-y-2.5 border-t border-current/15 pt-5">
                      {tier.includes.map((item) => (
                        <li
                          key={item}
                          className={`flex items-start gap-2 text-[11.5px] leading-snug ${
                            highlight ? "text-[#d6ded3]" : "text-ink-soft"
                          }`}
                        >
                          <Check
                            size={12}
                            className={highlight ? "mt-0.5 text-lime" : "mt-0.5 text-success"}
                            aria-hidden
                          />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={workspaceHref}
                      className={`btn mt-7 w-full ${
                        highlight ? "btn-lime" : "btn-secondary"
                      }`}
                    >
                      Start with {tier.shortLabel}
                      <ArrowRight size={14} aria-hidden />
                    </Link>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </section>

        <section id="scope" className="border-b border-line bg-card">
          <div className="mx-auto grid max-w-[1220px] gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-2">
            <div>
              <div className="mono-label">Scope, honestly</div>
              <h2 className="display mt-4 text-[42px] md:text-[52px]">
                Useful, bounded,
                <br />
                and clear about it.
              </h2>
              <p className="mt-5 max-w-[440px] text-[13px] leading-relaxed text-muted">
                {selfService
                  ? "An automated scan is a point-in-time check, not a certificate of invulnerability. Review what the scanner found, validate it in your code, then decide what to fix."
                  : "An audit is a point-in-time review, not a certificate of invulnerability. The report says what was reviewed, what was not, and what to fix first."}
              </p>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {(selfService
                ? [
                    {
                      q: "Does a clean scan guarantee that my code is secure?",
                      a: "No. Automated checks have limits and may miss issues or report false positives. A clean result is not a guarantee of security.",
                    },
                    {
                      q: "Is this a penetration test or human security audit?",
                      a: "No. This product performs static analysis on supplied code. Penetration testing, runtime testing, and human analyst review are out of scope.",
                    },
                    {
                      q: "What happens to my source code?",
                      a: "Scans run against an isolated source snapshot. Secret values are redacted from findings, and source retention is configurable.",
                    },
                    {
                      q: "Can I verify that fixes worked?",
                      a: "Yes. Re-scan the project after changing your code to compare findings and check which issues remain.",
                    },
                  ]
                : [
                {
                  q: "Do you guarantee zero vulnerabilities?",
                  a: "No. The product finds and prioritizes issues and verifies fixes on re-scan. It does not certify a codebase as risk-free, and the report states that explicitly.",
                },
                {
                  q: "Is this a penetration test?",
                  a: "No. Penetration testing, red-teaming, and social engineering are out of scope. The audit is a static review of the supplied code and dependency surface.",
                },
                {
                  q: "What happens to our source code?",
                  a: "Scans run against an isolated source snapshot. Raw secret values are redacted from findings, access is audit-logged, and retention is configurable. Snapshots are purged by the retention job unless an engagement needs them for a verification re-scan.",
                },
                {
                  q: "Can we use this for compliance?",
                  a: "It can inform SOC 2 or ISO 27001 readiness, but it does not issue certifications. Legal terms and the service agreement must be reviewed separately by counsel.",
                },
                  ]
              ).map((item) => (
                <details key={item.q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[13.5px] font-semibold">
                    {item.q}
                    <span className="font-mono text-[15px] text-muted transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-2.5 max-w-[520px] text-[12.5px] leading-relaxed text-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-lime">
          <div className="mx-auto flex max-w-[1220px] flex-col justify-between gap-7 px-5 py-14 md:flex-row md:items-center md:px-8">
            <div>
              <div className="mono-label text-forest/70">Pre-launch or pre-fundraising</div>
              <h2 className="display mt-3 max-w-[700px] text-[38px] font-medium text-forest md:text-[50px]">
                A credible security check,
                <br />
                without the enterprise theatre.
              </h2>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3">
              <Link href={workspaceHref} className="btn btn-primary">
                {selfService ? "Open your freelancer workspace" : "Open the audit workspace"}
                <ArrowRight size={15} aria-hidden />
              </Link>
              <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-forest/70">
                <CircleAlert size={11} aria-hidden />
                {freeMode ? "Early access · audits are free" : "No live charges in test mode"}
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex max-w-[1220px] flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <div>
            <Logo />
            <p className="mt-2 max-w-[360px] text-[11px] leading-relaxed text-muted">
              {selfService
                ? `${APP_NAME} is a self-service security scanner for freelancers building with AI-generated code.`
                : `${APP_NAME} is a productized security audit service for teams shipping AI-generated software. Free early access.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted">
            <Link href={workspaceHref} className="hover:text-ink">
              {open ? "Open workspace" : selfService ? "Freelancer sign in" : "Analyst & client sign in"}
            </Link>
            <span>© {new Date().getFullYear()} VibeCheck</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={11} aria-hidden />
              {selfService ? "Automated results · validate before relying" : "Human review required"}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
