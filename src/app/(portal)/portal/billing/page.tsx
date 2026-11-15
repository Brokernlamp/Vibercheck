import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, ArrowRight, Check, CreditCard, Info, Plus } from "lucide-react";
import { db } from "@/db";
import { invoices, organizations, subscriptions } from "@/db/schema";
import { SubmitButton } from "@/components/submit-button";
import { Notice, PageHeader, SectionTitle } from "@/components/ui";
import { upgradeSubscriptionAction } from "@/app/actions/engagements";
import { requireClient } from "@/lib/auth";
import { isFreeMode } from "@/lib/env";
import { FreePlanPage } from "@/components/free-plan-page";
import { formatDate, formatMoney, TIERS, TIER_ORDER } from "@/lib/domain";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireClient();
  const params = await searchParams;
  const upgraded = params.upgraded === "1";
  const already = params.already === "1";

  if (!user.orgId) {
    return <Notice message="Your account is not linked to an organization." tone="error" />;
  }

  if (isFreeMode()) {
    return <FreePlanPage orgName={user.orgName} />;
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.orgId))
    .limit(1);
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, user.orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const orgInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.orgId, user.orgId))
    .orderBy(desc(invoices.createdAt));

  const active = subscription?.status === "ACTIVE";

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
        >
          <ArrowLeft size={12} aria-hidden />
          Back to projects
        </Link>
        <Link
          href="/portal/new"
          className="btn btn-primary"
        >
          <Plus size={14} aria-hidden />
          New audit
        </Link>
      </div>
      <PageHeader
        eyebrow={`${org?.name ?? "Developer"} / billing`}
        title={
          <>
            Simple terms.
            <br />
            No surprise invoices.
          </>
        }
        description="Audits are fixed price. Monitoring is a fixed monthly retainer. This prototype runs the checkout and subscription lifecycle in test mode — no card data, no live charge."
      />

      {upgraded && (
        <Notice
          message="Monitoring is active in test mode. Recurring scan coordination is now attached to your organization."
          className="mb-5"
        />
      )}
      {already && (
        <Notice
          message="Your organization already has an active monitoring subscription."
          tone="info"
          className="mb-5"
        />
      )}

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-medium/25 bg-medium-soft px-3.5 py-3 text-[11.5px] leading-relaxed text-medium">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <strong>Test-mode billing.</strong> Checkout and subscription state are
          recorded as simulated invoices. Connecting a live payment provider is a
          handover item; the billing module exposes the same one-time/subscription
          interface a provider webhook would call.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_300px]">
        <div className="sheet p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mono-label">Current plan</div>
              <h2 className="mt-2 font-serif text-[32px] tracking-[-0.03em]">
                {active ? "Continuous Monitoring" : "Pay as you audit"}
              </h2>
              <p className="mt-1.5 max-w-[480px] text-[12px] leading-relaxed text-muted">
                {active
                  ? "Recurring re-scans and priority analyst turnaround. PR-based CI checks are represented by the Phase 2 connector in the PRD."
                  : "One-time audit engagements with no recurring commitment. Upgrade when you want ongoing coverage for new AI-generated changes."}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-paper px-4 py-3 text-right">
              <div className="font-serif text-[30px] leading-none">
                {active ? formatMoney(subscription!.amountCents) : "—"}
              </div>
              <div className="mono-label mt-1 text-[8px]">
                {active ? "per month" : "no subscription"}
              </div>
            </div>
          </div>

          {active ? (
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
                <div className="mono-label text-[8px]">Status</div>
                <div className="mt-1 text-[12px] font-semibold capitalize">
                  {subscription!.status.toLowerCase()}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
                <div className="mono-label text-[8px]">Renews</div>
                <div className="mt-1 text-[12px] font-semibold">
                  {formatDate(subscription!.currentPeriodEnd)}
                </div>
              </div>
              <div className="rounded-lg border border-line bg-paper px-3 py-2.5">
                <div className="mono-label text-[8px]">Provider</div>
                <div className="mt-1 text-[12px] font-semibold">Simulated</div>
              </div>
            </div>
          ) : (
            <form action={upgradeSubscriptionAction} className="mt-6">
              <input type="hidden" name="engagementId" value="" />
              <div className="rounded-lg border border-forest bg-forest p-4 text-paper">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold">
                        Continuous Monitoring
                      </span>
                      <span className="bg-lime px-1.5 py-0.5 font-mono text-[8px] font-semibold text-forest">
                        {formatMoney(TIERS.CONTINUOUS_MONITORING.priceCents)}/mo
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#aebdaf]">
                      Scheduled re-scans, priority queue, and risk trend tracking.
                    </p>
                  </div>
                  <SubmitButton variant="lime" pendingLabel="Starting subscription…">
                    Upgrade in test mode
                    <ArrowRight size={13} aria-hidden />
                  </SubmitButton>
                </div>
              </div>
            </form>
          )}
        </div>

        <div className="sheet p-5">
          <div className="mono-label">Payment method</div>
          <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-dashed border-line-strong bg-paper px-3 py-3">
            <CreditCard size={16} className="text-muted" aria-hidden />
            <div>
              <div className="text-[11.5px] font-semibold">Test mode</div>
              <div className="text-[10px] text-muted">No card on file</div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-[10.5px] leading-relaxed text-muted">
            <div className="flex items-start gap-1.5">
              <Check size={11} className="mt-0.5 text-success" aria-hidden />
              One-time and recurring flows both exercised.
            </div>
            <div className="flex items-start gap-1.5">
              <Check size={11} className="mt-0.5 text-success" aria-hidden />
              Invoice records are scoped to your organization.
            </div>
            <div className="flex items-start gap-1.5">
              <Check size={11} className="mt-0.5 text-success" aria-hidden />
              No card data touches this application.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-9">
        <SectionTitle eyebrow="Ledger" title="Invoices" />
        {orgInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card/60 px-5 py-8 text-center text-[12px] text-muted">
            No invoices yet. Starting an audit creates a simulated paid invoice.
          </div>
        ) : (
          <div className="sheet overflow-x-auto">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {orgInvoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="whitespace-nowrap text-[11px] text-muted">
                      {formatDate(invoice.createdAt)}
                    </td>
                    <td className="min-w-[240px] text-[11.5px]">
                      {invoice.description}
                    </td>
                    <td className="text-[10.5px] uppercase text-muted">
                      {invoice.kind === "SUBSCRIPTION" ? "Recurring" : "One-time"}
                    </td>
                    <td className="whitespace-nowrap font-mono text-[11px]">
                      {formatMoney(invoice.amountCents)}
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          invoice.status === "PAID" || invoice.status === "ACTIVE"
                            ? "border-success/20 bg-success-soft text-success"
                            : ""
                        }`}
                      >
                        {invoice.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="font-mono text-[9.5px] text-muted">
                      {invoice.provider.toLowerCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-9">
        <SectionTitle eyebrow="Reference" title="Audit tiers" />
        <div className="grid gap-3 md:grid-cols-3">
          {TIER_ORDER.map((key) => {
            const tier = TIERS[key];
            return (
              <div key={key} className="sheet p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[12px] font-semibold">{tier.label}</div>
                  <span className="font-mono text-[10.5px]">
                    {formatMoney(tier.priceCents)}
                    {tier.cadence === "monthly" ? "/mo" : ""}
                  </span>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                  {tier.blurb}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
