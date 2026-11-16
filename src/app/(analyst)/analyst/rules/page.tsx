import type { Metadata } from "next";
import { Bot, Bug, KeyRound, Package } from "lucide-react";
import { SeverityBadge } from "@/components/badges";
import { PageHeader, StatCard } from "@/components/ui";
import { customRules } from "@/lib/scan/rules";
import { secretRules } from "@/lib/scan/secrets";
import { ADVISORIES } from "@/lib/scan/advisories";
import { OWASP_CATEGORIES, SOURCE_LABELS } from "@/lib/domain";

export const metadata: Metadata = { title: "Ruleset" };

export default function RulesPage() {
  const total = customRules.length + secretRules.length + 2;
  return (
    <div>
      <PageHeader
        eyebrow="Detection catalog / engine 0.1.0"
        title={
          <>
            Every check has
            <br />
            a name.
          </>
        }
        description="No opaque score. The initial ruleset targets the failure modes repeatedly observed in AI-generated repositories, plus the MCP surface that traditional scanners do not cover. Confidence values are starting heuristics, not calibrated probabilities."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="AI-code + MCP checks"
          value={customRules.length}
          detail="Context-aware heuristics"
          accent
        />
        <StatCard
          label="Secret detectors"
          value={secretRules.length}
          detail="Evidence always redacted"
        />
        <StatCard
          label="Dependency rules"
          value={2}
          detail={`${ADVISORIES.length} demo advisories + license policy`}
        />
        <StatCard label="Total named checks" value={total} detail="Benchmarked for FP rate" />
      </div>

      <div className="mt-8 grid gap-3 md:grid-cols-3">
        {[
          {
            icon: Bug,
            title: "AI-code patterns",
            body: "Missing authorization, string-built SQL, default credentials, weak JWT handling, insecure randomness, mass assignment, upload traversal, SSRF, open redirect, and more.",
          },
          {
            icon: Bot,
            title: "MCP surface",
            body: "Unauthenticated HTTP MCP servers, wildcard tool permissions, and shell command construction from model-controlled arguments.",
          },
          {
            icon: KeyRound,
            title: "Secrets",
            body: "Provider tokens, private keys, generic high-risk assignments, and committed environment files. Raw values are replaced before persistence.",
          },
        ].map((item) => (
          <div key={item.title} className="sheet p-5">
            <item.icon size={16} className="text-ink-soft" aria-hidden />
            <h2 className="mt-3 text-[13px] font-semibold">{item.title}</h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="mono-label">Custom rules</div>
            <h2 className="mt-1 font-serif text-[25px] tracking-[-0.025em]">
              {customRules.length} AI-code / MCP checks
            </h2>
          </div>
          <div className="font-mono text-[9px] text-muted">
            SEVERITY · OWASP · CONFIDENCE
          </div>
        </div>
        <div className="space-y-2">
          {customRules.map((rule) => (
            <details key={rule.id} className="sheet group p-4">
              <summary className="flex cursor-pointer list-none items-start gap-3">
                <span className="mt-0.5 hidden w-[92px] shrink-0 sm:block">
                  <SeverityBadge severity={rule.severity} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[9px] text-muted">{rule.id}</span>
                    <span className="chip">{rule.owasp}</span>
                    <span className="chip">{SOURCE_LABELS[rule.source]}</span>
                  </span>
                  <span className="mt-1 block text-[12.5px] font-semibold">
                    {rule.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted">
                    {OWASP_CATEGORIES[rule.owasp] ?? "Custom category"} · initial
                    confidence {rule.confidence}%
                  </span>
                </span>
                <span className="hidden shrink-0 font-mono text-[9px] text-muted sm:block">
                  {rule.category}
                </span>
              </summary>
              <div className="mt-3 grid gap-3 border-t border-line pt-3 text-[11px] leading-relaxed sm:grid-cols-2">
                <div>
                  <div className="mono-label text-[8px]">Why it matters</div>
                  <p className="mt-1 text-ink-soft">{rule.description}</p>
                </div>
                <div>
                  <div className="mono-label text-[8px]">Remediation</div>
                  <p className="mt-1 text-ink-soft">{rule.remediation}</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3">
          <div className="mono-label">Secrets + supply chain</div>
          <h2 className="mt-1 font-serif text-[25px] tracking-[-0.025em]">
            {secretRules.length + 2} supporting checks
          </h2>
        </div>
        <div className="space-y-2">
          {secretRules.map((rule) => (
            <div key={rule.id} className="sheet flex flex-wrap items-start gap-3 p-4">
              <span className="w-[92px] shrink-0">
                <SeverityBadge severity={rule.severity} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] text-muted">{rule.id}</div>
                <div className="mt-0.5 text-[12px] font-semibold">{rule.title}</div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                  {rule.description}
                </p>
              </div>
              <span className="font-mono text-[9px] text-muted">
                {rule.confidence}% confidence
              </span>
            </div>
          ))}
          <div className="sheet flex flex-wrap items-start gap-3 p-4">
            <span className="w-[92px] shrink-0">
              <SeverityBadge severity="HIGH" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] text-muted">SCA-VULN-001</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold">
                <Package size={12} aria-hidden />
                Vulnerable declared dependency
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Matches npm/PyPI packages against {ADVISORIES.length} seeded
                advisories. Production should use OSV/Trivy data and a lockfile/SBOM.
              </p>
            </div>
            <span className="font-mono text-[9px] text-muted">94% confidence</span>
          </div>
          <div className="sheet flex flex-wrap items-start gap-3 p-4">
            <span className="w-[92px] shrink-0">
              <SeverityBadge severity="HIGH" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] text-muted">SCA-LICENSE-001</div>
              <div className="mt-0.5 text-[12px] font-semibold">
                Restrictive dependency license
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted">
                Flags AGPL/SSPL/GPL/Elastic-class licenses in direct and vendored
                dependencies as an engineering signal for counsel review.
              </p>
            </div>
            <span className="font-mono text-[9px] text-muted">88% confidence</span>
          </div>
        </div>
      </div>

      <div className="mt-8 border border-line bg-card p-5">
        <div className="mono-label">Fixture smoke tests · not accuracy measurements</div>
        <div className="mt-3 grid gap-4 text-[11.5px] leading-relaxed text-ink-soft md:grid-cols-3">
          <div>
            <div className="font-serif text-[26px] leading-none">2</div>
            <div className="mt-1 text-[10.5px] text-muted">
              local fixture repositories exercised
            </div>
          </div>
          <div>
            <div className="font-serif text-[26px] leading-none">1</div>
            <div className="mt-1 text-[10.5px] text-muted">
              seeded vulnerable fixture
            </div>
          </div>
          <div>
            <div className="font-serif text-[26px] leading-none">1</div>
            <div className="mt-1 text-[10.5px] text-muted">
              hardened control fixture
            </div>
          </div>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-muted">
          These fixtures are smoke tests for known examples, not an independent
          measure of precision, recall, or performance on arbitrary repositories.
        </p>
      </div>
    </div>
  );
}
