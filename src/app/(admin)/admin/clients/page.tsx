import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ArrowUpRight, Building2, Crown, MailPlus, ShieldCheck } from "lucide-react";
import { db } from "@/db";
import {
  engagements,
  invites,
  invoices,
  organizations,
  subscriptions,
  users,
} from "@/db/schema";
import {
  createOrganizationAction,
  revokeInviteAction,
  resendInviteAction,
  setUserActiveAction,
} from "@/app/actions/invites";
import { StatusBadge, TierBadge } from "@/components/badges";
import { InviteUserForm } from "@/components/invite-user-form";
import { Notice, PageHeader, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isFreeMode, openAccess, soloMode } from "@/lib/env";
import { formatDate, formatDateTime, formatMoney } from "@/lib/domain";
import { getScanHistory } from "@/lib/queries";export const metadata: Metadata = { title: "Projects" };
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;
  const error = typeof params.error === "string" ? params.error : null;
  const freeMode = isFreeMode();
  const open = openAccess();

  const [orgs, allUsers, allEngagements, allSubscriptions, paidInvoices, pendingInvites] =
    await Promise.all([
      db.select().from(organizations).orderBy(desc(organizations.createdAt)),
      db.select().from(users).orderBy(desc(users.createdAt)),
      db.select().from(engagements).orderBy(desc(engagements.createdAt)),
      db.select().from(subscriptions),
      db.select().from(invoices).where(eq(invoices.status, "PAID")),
      db
        .select()
        .from(invites)
        .where(and(isNull(invites.acceptedAt), isNull(invites.revokedAt)))
        .orderBy(desc(invites.createdAt)),
    ]);

  const clients = await Promise.all(
    orgs.map(async (org) => {
      const orgUsers = allUsers.filter((user) => user.orgId === org.id);
      const orgEngagements = allEngagements.filter(
        (engagement) => engagement.orgId === org.id,
      );
      const engagementRows = await Promise.all(
        orgEngagements.map(async (engagement) => {
          const history = await getScanHistory(engagement.id);
          return { engagement, scan: history[0] ?? null };
        }),
      );
      const subscription = allSubscriptions.find(
        (item) => item.orgId === org.id && item.status === "ACTIVE",
      );
      const revenue = paidInvoices
        .filter((invoice) => invoice.orgId === org.id)
        .reduce((sum, invoice) => sum + invoice.amountCents, 0);
      return {
        org,
        orgUsers,
        engagementRows,
        subscription,
        revenue,
        delivered: engagementRows.filter((row) =>
          ["DELIVERED", "REMEDIATION", "CLOSED"].includes(row.engagement.status),
        ).length,
      };
    }),
  );

  const mrr = clients.reduce(
    (sum, client) => sum + (client.subscription?.amountCents ?? 0),
    0,
  );
  const totalRevenue = clients.reduce((sum, client) => sum + client.revenue, 0);

  return (
    <div>
      <PageHeader
        eyebrow={soloMode() ? "Operations / freelancers" : "Operations / developers"}
        title={
          <>
            Workspaces are
            <br />
            isolated by default.
          </>
        }
        description={`Workspace scope is enforced on every ${soloMode() ? "freelancer" : "developer"} query, not just the UI. This view is operator-only and spans all workspaces; each project link stays scoped to its organization.`}
      />

      {(notice || error) && (
        <div className="mb-5 space-y-2">
          {error && <Notice message={error} tone="error" />}
          {notice && <Notice message={notice} />}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Organizations" value={clients.length} detail="Active workspace records" />
        <StatCard
          label="People"
          value={allUsers.filter((user) => user.isActive).length}
          detail="Workspace-scoped accounts"
        />
        <StatCard
          label={freeMode ? "Billing" : "MRR"}
          value={freeMode ? "Off" : formatMoney(mrr)}
          detail={freeMode ? "Free early access" : "Test-mode billing"}
          accent
        />
        <StatCard
          label={freeMode ? "Monitoring plans" : "Collected"}
          value={
            freeMode
              ? clients.filter((client) => client.subscription).length
              : formatMoney(totalRevenue)
          }
          detail={freeMode ? "Active subscriptions" : "Simulated invoices"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
        <section className="sheet p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-paper text-ink-soft">
              <MailPlus size={15} aria-hidden />
            </span>
            <div>
              <h2 className="font-serif text-[22px] tracking-[-0.02em]">
                {open ? "Add a workspace" : "Invite someone"}
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {open
                  ? `Workspaces keep ${soloMode() ? "freelancer" : "developer"} data isolated. Create one per person.`
                  : `Freelancers get workspace-scoped access. Analysts get the review desk. Invitations expire after seven days and are single-use.`}
              </p>
            </div>
          </div>
          <form
            action={createOrganizationAction}
            className="mt-5 grid gap-2 border-b border-line pb-5 sm:grid-cols-[1fr_150px_auto]"
          >
            <div>
              <label htmlFor="org-name" className="field-label">
                Organization
              </label>
              <input
                id="org-name"
                name="name"
                required
                minLength={2}
                maxLength={120}
                className="field"
                placeholder="My SaaS App"
              />
            </div>
            <div>
              <label htmlFor="org-slug" className="field-label">
                Slug
              </label>
              <input
                id="org-slug"
                name="slug"
                required
                pattern="[a-z0-9][a-z0-9-]{1,58}[a-z0-9]"
                className="field font-mono"
                placeholder="acme"
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-secondary w-full">
                Add workspace
              </button>
            </div>
          </form>

          {!open && (
            <div className="mt-5">
              <InviteUserForm
                organizations={orgs.map((org) => ({ id: org.id, name: org.name }))}
                selfService={soloMode()}
              />
            </div>
          )}
        </section>

        <section className="sheet p-5">
          <div className="mono-label">Pending invitations</div>
          <div className="mt-3 space-y-2">
            {!open && pendingInvites.length === 0 && (
              <p className="text-[11px] leading-relaxed text-muted">
                No open invitations. New invites appear here until accepted or
                revoked.
              </p>
            )}
            {!open && pendingInvites.map((invite) => {
              const org = orgs.find((item) => item.id === invite.orgId);
              const expired = invite.expiresAt.getTime() < Date.now();
              return (
                <div
                  key={invite.id}
                  className="rounded-lg border border-line bg-card px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[11.5px] font-semibold">
                        {invite.name}
                      </div>
                      <div className="truncate text-[10px] text-muted">
                        {invite.email}
                      </div>
                      <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted">
                        {invite.role} · {org?.name ?? "staff"} · expires {formatDateTime(invite.expiresAt)}
                        {expired ? " · expired" : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <form action={resendInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Resend
                        </button>
                      </form>
                      <form action={revokeInviteAction}>
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Revoke
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="mt-8 space-y-3">
        {clients.map((client) => (
          <section key={client.org.id} className="sheet overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-paper/60 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-card text-ink-soft">
                  <Building2 size={17} aria-hidden />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-serif text-[24px] tracking-[-0.02em]">
                      {client.org.name}
                    </h2>
                    <span
                      className={`chip ${
                        client.org.plan === "MONITORING"
                          ? "border-lime-deep/30 bg-lime/30 text-forest"
                          : ""
                      }`}
                    >
                      {client.org.plan === "MONITORING" ? (
                        <>
                          <Crown size={9} aria-hidden />
                          Monitoring
                        </>
                      ) : (
                        "Audit only"
                      )}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                    <span className="font-mono">{client.org.slug}</span>
                    <span>{client.orgUsers.length} users</span>
                    <span>Since {formatDate(client.org.createdAt)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 text-right">
                {freeMode ? (
                  <span className="chip border-success/20 bg-success-soft text-success">
                    Free early access
                  </span>
                ) : (
                  <>
                    <div>
                      <div className="font-mono text-[13px] font-semibold">
                        {client.subscription
                          ? `${formatMoney(client.subscription.amountCents)}/mo`
                          : "—"}
                      </div>
                      <div className="mono-label mt-0.5 text-[7.5px]">recurring</div>
                    </div>
                    <div>
                      <div className="font-mono text-[13px] font-semibold">
                        {formatMoney(client.revenue)}
                      </div>
                      <div className="mono-label mt-0.5 text-[7.5px]">collected</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-0 md:grid-cols-[1fr_260px]">
              <div className="overflow-x-auto">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Engagement</th>
                      <th>Status</th>
                      <th>Tier</th>
                      <th>Risk</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {client.engagementRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-[11px] text-muted">
                          No projects for this workspace.
                        </td>
                      </tr>
                    )}
                    {client.engagementRows.map(({ engagement, scan }) => (
                      <tr key={engagement.id}>
                        <td>
                          <Link
                            href={`/admin/engagements/${engagement.id}`}
                            className="inline-flex items-center gap-1 text-[11.5px] font-semibold hover:underline"
                          >
                            {engagement.name}
                            <ArrowUpRight size={9} aria-hidden />
                          </Link>
                        </td>
                        <td>
                          <StatusBadge status={engagement.status} />
                        </td>
                        <td>
                          <TierBadge tier={engagement.tier} />
                        </td>
                        <td className="font-mono text-[10.5px]">
                          {scan?.score !== null && scan?.score !== undefined
                            ? `${scan.score}/${scan.grade}`
                            : "—"}
                        </td>
                        <td className="text-[9.5px] text-muted">
                          {client.delivered} delivered
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line p-4 md:border-l md:border-t-0">
                <div className="mono-label">Users</div>
                <div className="mt-2 space-y-2">
                  {client.orgUsers.map((user) => (
                    <div key={user.id} className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-paper-deep font-mono text-[8px]">
                        {user.name
                          .split(/\s+/)
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[10.5px] font-semibold">
                          {user.name}
                          {!user.isActive && (
                            <span className="ml-1 font-mono text-[8px] text-critical">
                              inactive
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[8.5px] text-muted">
                          {user.email}
                        </div>
                      </div>
                      <form action={setUserActiveAction}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={user.isActive ? "0" : "1"}
                        />
                        <button
                          type="submit"
                          className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-muted hover:text-ink"
                        >
                          {user.isActive ? "Disable" : "Enable"}
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[9px] text-muted">
                  <ShieldCheck size={10} aria-hidden />
                  Developer data scoped server-side
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
