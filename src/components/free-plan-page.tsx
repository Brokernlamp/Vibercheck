import Link from "next/link";
import { ArrowRight, Check, CreditCard, LockKeyhole, Plus } from "lucide-react";
import { PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { TIERS, TIER_ORDER } from "@/lib/domain";

export function FreePlanPage({ orgName }: { orgName: string | null }) {
  return (
    <div>
      <PageHeader
        eyebrow={`${orgName ?? "Developer"} / plan`}
        title={
          <>
            Free while
            <br />
            we earn trust.
          </>
        }
        description="Every audit tier is free during early access. No card, no invoice, and no automatic charge when paid plans return."
        actions={
          <Link href="/portal/new" className="btn btn-primary">
            <Plus size={14} aria-hidden />
            New audit
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Current plan" value="Early access" detail="All audits free" accent />
        <StatCard label="Payment method" value="None" detail="No card on file" />
        <StatCard label="Invoices" value="0" detail="Nothing to pay" />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="sheet p-5 md:p-6">
          <SectionTitle eyebrow="Included now" title="Pick the review you need" />
          <div className="mt-4 space-y-2.5">
            {TIER_ORDER.map((key) => {
              const tier = TIERS[key];
              return (
                <div
                  key={key}
                  className="rounded-lg border border-line bg-card px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-[13px] font-semibold">{tier.label}</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                        {tier.blurb}
                      </p>
                    </div>
                    <span className="chip border-success/20 bg-success-soft text-success">
                      Free
                    </span>
                  </div>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {tier.includes.map((item) => (
                      <div
                        key={item}
                        className="flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-soft"
                      >
                        <Check size={11} className="mt-0.5 shrink-0 text-success" aria-hidden />
                        {item}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                      Turnaround: {tier.turnaround}
                    </span>
                    <Link
                      href="/portal/new"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
                    >
                      Start <ArrowRight size={11} aria-hidden />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-3">
          <div className="sheet p-5">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-paper-deep text-ink-soft">
                <CreditCard size={15} aria-hidden />
              </span>
              <div>
                <div className="mono-label">Payments are off</div>
                <div className="text-[12px] font-semibold">Nothing to manage</div>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-[11px] leading-relaxed text-muted">
              <li className="flex items-start gap-1.5">
                <Check size={11} className="mt-0.5 text-success" aria-hidden />
                Starting an audit creates no invoice.
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={11} className="mt-0.5 text-success" aria-hidden />
                No card details are collected or stored.
              </li>
              <li className="flex items-start gap-1.5">
                <Check size={11} className="mt-0.5 text-success" aria-hidden />
                Existing reports stay accessible if billing returns.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-dashed border-line-strong bg-card/60 p-5">
            <div className="flex items-center gap-1.5">
              <LockKeyhole size={12} className="text-muted" aria-hidden />
              <div className="mono-label">The fine print</div>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Early access is a limited-time offer, not a permanent license. We
              will give notice before introducing paid plans and will never charge
              a card we do not have.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
