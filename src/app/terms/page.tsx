import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { Logo } from "@/components/logo";

export const metadata: Metadata = { title: "Service terms (prototype)" };

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-paper/90">
        <div className="mx-auto flex max-w-[840px] items-center justify-between px-5 py-4">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={12} aria-hidden />
            Back to site
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[760px] px-5 py-12">
        <div className="mono-label">Legal · placeholder</div>
        <h1 className="display mt-3 text-[44px]">Service terms, in outline.</h1>
        <div className="mt-5 rounded-lg border border-medium/25 bg-medium-soft px-4 py-3 text-[12px] leading-relaxed text-medium">
          <strong>Prototype notice.</strong> This text is a product-flow placeholder,
          not legal advice or a binding agreement. The production service agreement,
          scope-of-audit disclaimer, and limitation-of-liability terms must be drafted
          by qualified counsel before the platform is used on real client engagements.
        </div>

        <div className="prose-audit mt-9 max-w-none">
          <h2 className="font-serif text-[26px]">1. Scope of the review</h2>
          <p>
            VibeCheck performs a static security review of the repository snapshot
            supplied by the developer, combined with automated analysis and a human
            analyst validation pass. The review covers the rules, dependencies, and
            configuration present in that snapshot. It does not include penetration
            testing, exploitation, runtime monitoring, or a review of infrastructure
            outside the supplied repository.
          </p>

          <h2 className="mt-7 font-serif text-[26px]">2. No guarantee or certification</h2>
          <p>
            A report identifies and prioritizes observed issues. It is not a
            certification that the codebase is free of vulnerabilities and does not
            constitute SOC 2, ISO 27001, PCI DSS, or any other compliance attestation.
            Re-scans verify the status of previously reported findings; they do not
            guarantee that new or unexamined issues do not exist.
          </p>

          <h2 className="mt-7 font-serif text-[26px]">3. Developer responsibilities</h2>
          <p>
            The developer confirms they are authorized to submit the repository for review,
            that the snapshot does not contain third-party data they lack permission to
            process, and that remediation decisions remain the developer&apos;s
            responsibility. Findings should be validated in the developer&apos;s own
            environment before and after changes.
          </p>

          <h2 className="mt-7 font-serif text-[26px]">4. Confidentiality and retention</h2>
          <p>
            Client source is treated as confidential. Access is limited to authorized
            analysts and operators, logged for audit, and never used to train or
            fine-tune a model. Retention is limited to what is required for review and
            re-scan; source snapshots can be purged by an operator, after which a new
            upload is required.
          </p>

          <h2 className="mt-7 font-serif text-[26px]">5. Limitation of liability</h2>
          <p>
            The final liability cap, exclusions, and governing law are to be supplied
            by counsel. In this prototype, no commercial engagement is created and no
            live payment is processed.
          </p>
        </div>

        <div className="mt-9 flex items-start gap-3 border-t border-line pt-5 text-[11px] leading-relaxed text-muted">
          <Scale size={15} className="mt-0.5 shrink-0" aria-hidden />
          Version terms-v1 · Prototype acceptance is recorded in the engagement audit
          log with the accepting user, timestamp, and report version.
        </div>
      </main>
    </div>
  );
}
