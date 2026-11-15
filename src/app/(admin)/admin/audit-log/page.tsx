import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { ArrowUpRight, TerminalSquare } from "lucide-react";
import { db } from "@/db";
import { auditLogs, engagements, organizations } from "@/db/schema";
import { PageHeader, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/domain";

export const metadata: Metadata = { title: "Audit log" };

const FILTERS = [
  { key: "all", label: "All events" },
  { key: "triage", label: "Triage" },
  { key: "reports", label: "Reports" },
  { key: "billing", label: "Billing" },
  { key: "retention", label: "Source / retention" },
  { key: "access", label: "Access / terms" },
] as const;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const filter =
    typeof params.kind === "string" &&
    FILTERS.some((item) => item.key === params.kind)
      ? params.kind
      : "all";

  const rows = await db
    .select({ log: auditLogs, org: organizations, engagement: engagements })
    .from(auditLogs)
    .leftJoin(organizations, eq(organizations.id, auditLogs.orgId))
    .leftJoin(engagements, eq(engagements.id, auditLogs.engagementId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);

  const filtered = rows.filter(({ log }) => {
    if (filter === "triage") return log.action.startsWith("finding.");
    if (filter === "reports") return log.action.startsWith("report.");
    if (filter === "billing") return log.action.startsWith("billing.");
    if (filter === "retention") return log.action.startsWith("source.");
    if (filter === "access")
      return (
        log.action.startsWith("terms.") ||
        log.action.startsWith("scan.") ||
        log.action.startsWith("engagement.") ||
        log.action.startsWith("review.")
      );
    return true;
  });

  const actors = new Set(rows.map(({ log }) => log.actorId).filter(Boolean));
  const finalizations = rows.filter(({ log }) => log.action === "report.finalized").length;
  const purges = rows.filter(({ log }) => log.action === "source.purged").length;

  return (
    <div>
      <PageHeader
        eyebrow="Operations / auditability"
        title={
          <>
            Every access.
            <br />
            Every decision.
          </>
        }
        description="Append-only record of who viewed, triaged, finalized, billed, or purged an engagement. The UI exposes no edit or delete path; retention should be enforced at the database role level in production."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Events shown" value={filtered.length} detail={`${rows.length} in window`} />
        <StatCard label="Distinct actors" value={actors.size} detail="Staff + client actions" />
        <StatCard label="Report finalizations" value={finalizations} detail="Human-gated deliveries" />
        <StatCard label="Source purges" value={purges} detail="Retention operations" />
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((item) => (
          <Link
            key={item.key}
            href={item.key === "all" ? "/admin/audit-log" : `/admin/audit-log?kind=${item.key}`}
            className={`rounded-full border px-2.5 py-1 text-[10.5px] font-semibold no-underline ${
              filter === item.key
                ? "border-forest bg-forest text-lime"
                : "border-line bg-card text-ink-soft"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 sheet overflow-x-auto">
        <table className="audit-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Tenant</th>
              <th>Engagement</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-[12px] text-muted">
                  No events match this filter.
                </td>
              </tr>
            )}
            {filtered.map(({ log, org, engagement }) => (
              <tr key={log.id}>
                <td className="whitespace-nowrap align-top text-[10px] text-muted">
                  <div>{formatDateTime(log.createdAt)}</div>
                  <div className="mt-0.5 text-[9px]">{relativeTime(log.createdAt)}</div>
                </td>
                <td className="align-top">
                  <div className="text-[10.5px] font-medium">
                    {log.actorEmail ?? "system"}
                  </div>
                  {log.actorRole && (
                    <div className="mt-0.5 font-mono text-[8px] text-muted">
                      {log.actorRole}
                    </div>
                  )}
                </td>
                <td className="align-top">
                  <span className="inline-flex items-center gap-1 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[8.5px]">
                    <TerminalSquare size={9} aria-hidden />
                    {log.action}
                  </span>
                </td>
                <td className="align-top text-[10.5px] text-muted">
                  {org?.name ?? "—"}
                </td>
                <td className="align-top text-[10.5px]">
                  {engagement ? (
                    <Link
                      href={`/admin/engagements/${engagement.id}`}
                      className="inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      {engagement.name}
                      <ArrowUpRight size={9} aria-hidden />
                    </Link>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="align-top">
                  {Object.keys(log.detail).length > 0 ? (
                    <details>
                      <summary className="cursor-pointer font-mono text-[8.5px] text-muted">
                        {Object.keys(log.detail).length} field
                        {Object.keys(log.detail).length === 1 ? "" : "s"}
                      </summary>
                      <pre className="mt-1 max-w-[300px] overflow-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-mono text-[8px] leading-relaxed text-ink-soft">
                        {JSON.stringify(log.detail, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-[9px] text-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 text-[10px] leading-relaxed text-muted">
        <TerminalSquare size={11} className="mt-0.5 shrink-0" aria-hidden />
        Audit records intentionally exclude raw code and secret values. Scoped by
        organization and engagement; production should stream them to immutable
        storage and alert on purge or delivery events.
      </div>
    </div>
  );
}
