import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  ArrowRight,
  Database,
  FileCheck2,
  ScanLine,
  Users,
} from "lucide-react";
import { db } from "@/db";
import {
  auditLogs,
  engagements,
  findings,
  invoices,
  organizations,
  scanRuns,
  subscriptions,
} from "@/db/schema";
import { StatusBadge, TierBadge } from "@/components/badges";
import { PageHeader, SectionTitle, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isFreeMode } from "@/lib/env";
import {
  formatDate,
  formatMoney,
  relativeTime,
} from "@/lib/domain";
import { getLatestReport, getScanHistory } from "@/lib/queries";

export const metadata: Metadata = { title: "Operations" };

export default async function AdminOverviewPage() {
  await requireAdmin();
  const freeMode = isFreeMode();

  const rows = await db
    .select({ engagement: engagements, organization: organizations })
    .from(engagements)
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .orderBy(desc(engagements.updatedAt));

  const enriched = await Promise.all(
    rows.map(async ({ engagement, organization }) => {
      const history = await getScanHistory(engagement.id);
      const scan = history[0] ?? null;
      const report = await getLatestReport(engagement.id);
      return { engagement, organization, scan, report };
    }),
  );

  const latestScanIds = enriched
    .map((row) => row.scan?.id)
    .filter((id): id is string => Boolean(id));
  const currentFindings =
    latestScanIds.length > 0
      ? await db
          .select()
          .from(findings)
          .where(inArray(findings.scanId, latestScanIds))
      : [];
  const triaged = currentFindings.filter(
    (finding) => finding.analystStatus !== "OPEN",
  );
  const dismissed = triaged.filter(
    (finding) => finding.analystStatus === "DISMISSED",
  ).length;
  const fpRate =
    triaged.length > 0 ? Math.round((dismissed / triaged.length) * 100) : 0;

  const [activeSubscriptions, paidInvoices, sourceRows, recentEvents] =
    await Promise.all([
      db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.status, "ACTIVE")),
      db.select().from(invoices).where(eq(invoices.status, "PAID")),
      db
        .select({ id: scanRuns.id })
        .from(scanRuns)
        .where(isNotNull(scanRuns.sourcePath)),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10),
    ]);

  const mrr = activeSubscriptions.reduce(
    (sum, subscription) => sum + subscription.amountCents,
    0,
  );
  const oneTime = paidInvoices
    .filter((invoice) => invoice.kind === "ONE_TIME")
    .reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const openReviews = enriched.filter(
    (row) => row.engagement.status === "UNDER_REVIEW",
  ).length;
  const delivered = enriched.filter((row) =>
    ["DELIVERED", "REMEDIATION", "CLOSED"].includes(row.engagement.status),
  ).length;
  const orgCount = new Set(enriched.map((row) => row.organization.id)).size;
  const sorted = [...enriched].sort((a, b) => {
    const priority: Record<string, number> = {
      UNDER_REVIEW: 0,
      SCANNING: 1,
      SCAN_FAILED: 2,
      READY_FOR_CLIENT: 3,
      DELIVERED: 4,
      REMEDIATION: 5,
      INTAKE: 6,
      CLOSED: 7,
    };
    return (
      (priority[a.engagement.status] ?? 9) -
        (priority[b.engagement.status] ?? 9) ||
      b.engagement.updatedAt.getTime() - a.engagement.updatedAt.getTime()
    );
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operator view / internal"
        title={
          <>
            Run the desk,
            <br />
            not the queue.
          </>
        }
        description="Every engagement, tenant, report state, and source-retention decision in one place. Access and mutations are recorded in the append-only audit log."
        actions={
          <>
            <Link href="/admin/audit-log" className="btn btn-secondary">
              Audit log
            </Link>
            <Link href="/admin/clients" className="btn btn-primary">
              <Users size={14} aria-hidden />
              Projects
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={freeMode ? "Billing mode" : "Monthly recurring"}
          value={freeMode ? "Free" : formatMoney(mrr)}
          detail={
            freeMode
              ? "Early access · no invoices"
              : `${activeSubscriptions.length} active subscription${
                  activeSubscriptions.length === 1 ? "" : "s"
                }`
          }
          accent
        />
        <StatCard
          label={freeMode ? "Paid invoices" : "One-time collected"}
          value={freeMode ? 0 : formatMoney(oneTime)}
          detail={freeMode ? "Billing disabled" : `${paidInvoices.length} paid invoices (test)`}
        />
        <StatCard
          label="Open analyst reviews"
          value={openReviews}
          detail={`${fpRate}% current triage FP rate`}
        />
        <StatCard
          label="Source snapshots"
          value={sourceRows.length}
          detail="Managed under .data/sources"
          href="/admin/audit-log"
        />
      </div>

      <div className="mt-9 grid gap-7 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8">
          <section>
            <SectionTitle
              eyebrow={`${rows.length} engagements / ${orgCount} organizations`}
              title="Portfolio"
              action={
                <span className="font-mono text-[9px] text-muted">
                  {delivered} delivered
                </span>
              }
            />
            <div className="sheet overflow-x-auto">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Engagement</th>
                    <th>Developer</th>
                    <th>Status</th>
                    <th>Tier</th>
                    <th>Risk</th>
                    <th>Reviews</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const reportCount = row.report ? 1 : 0;
                    return (
                      <tr key={row.engagement.id}>
                        <td>
                          <Link
                            href={`/admin/engagements/${row.engagement.id}`}
                            className="font-semibold hover:underline hover:underline-offset-2"
                          >
                            {row.engagement.name}
                          </Link>
                          <div className="mt-1 font-mono text-[8.5px] text-muted">
                            ENG-{row.engagement.id.slice(0, 8).toUpperCase()}
                          </div>
                        </td>
                        <td className="text-[11.5px] text-muted">
                          {row.organization.name}
                        </td>
                        <td>
                          <StatusBadge status={row.engagement.status} />
                        </td>
                        <td>
                          <TierBadge tier={row.engagement.tier} />
                        </td>
                        <td className="whitespace-nowrap font-mono text-[11px]">
                          {row.scan?.score !== null && row.scan?.score !== undefined
                            ? `${row.scan.score} / ${row.scan.grade}`
                            : "—"}
                        </td>
                        <td className="text-[10.5px] text-muted">
                          {row.engagement.reviewCompletedAt
                            ? "Signed off"
                            : reportCount
                              ? "Pending"
                              : "—"}
                        </td>
                        <td className="whitespace-nowrap text-[10.5px] text-muted">
                          {relativeTime(row.engagement.updatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <SectionTitle eyebrow="Append-only" title="Recent activity" />
            <div className="sheet divide-y divide-line">
              {recentEvents.map((event) => (
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
                      {event.engagementId && (
                        <Link
                          href={`/admin/engagements/${event.engagementId}`}
                          className="hover:text-ink"
                        >
                          · engagement
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="sheet p-5">
            <div className="flex items-center justify-between">
              <div className="mono-label">Operator controls</div>
              <Database size={15} className="text-muted" aria-hidden />
            </div>
            <div className="mt-3 space-y-2">
              {[
                {
                  href: "/admin/clients",
                  title: "Developer projects",
                  detail: "Plans, subscription state, tenant scope",
                  icon: Users,
                },
                {
                  href: "/admin/audit-log",
                  title: "Audit log",
                  detail: "Access, triage, report, purge events",
                  icon: FileCheck2,
                },
                {
                  href: "/analyst",
                  title: "Analyst desk",
                  detail: "Triage and finalize as staff",
                  icon: ScanLine,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-start gap-2.5 rounded-lg border border-line bg-paper px-3 py-2.5 no-underline transition hover:border-line-strong"
                >
                  <item.icon size={14} className="mt-0.5 text-ink-soft" aria-hidden />
                  <span>
                    <span className="block text-[11.5px] font-semibold">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] text-muted">
                      {item.detail}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="sheet p-5">
            <div className="mono-label">Retention posture</div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Source snapshots are intentionally retained for re-scans. Configure{" "}
              <code className="rounded bg-paper-deep px-1 py-0.5 font-mono text-[9px]">
                SOURCE_RETENTION_DAYS
              </code>{" "}
              and run the purge script for non-monitoring engagements. Per-engagement
              purge is available in the detail view.
            </p>
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[10px]">
              <span className="text-muted">Snapshots retained</span>
              <span className="font-mono">{sourceRows.length}</span>
            </div>
          </div>

          <div className="border border-dashed border-line-strong bg-card/60 p-5">
            <div className="mono-label">Launch blocker</div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Legal terms, a platform security review, and a live payment
              provider are required before real client data. See the project
              documentation for the handover checklist.
            </p>
            <Link
              href="/terms"
              className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-semibold underline decoration-line-strong underline-offset-4"
            >
              Review terms placeholder <ArrowRight size={10} aria-hidden />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
