import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { MonitorSmartphone, ShieldCheck, ShieldOff } from "lucide-react";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import {
  beginMfaSetupAction,
  revokeAllSessionsAction,
  revokeSessionAction,
} from "@/app/actions/auth";
import { MfaDisableForm, RecoveryCodesForm } from "@/components/mfa-settings";
import { PasswordForm } from "@/components/password-form";
import { Notice, PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/domain";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const notice = typeof params.notice === "string" ? params.notice : null;

  const [activeSessions, record] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, user.id))
      .orderBy(desc(sessions.lastSeenAt)),
    db
      .select({
        mfaEnabledAt: users.mfaEnabledAt,
        mfaRecoveryCodes: users.mfaRecoveryCodes,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const mfaEnabled = Boolean(record?.mfaEnabledAt);
  const recoveryCodes = record?.mfaRecoveryCodes ?? [];

  return (
    <div>
      <PageHeader
        eyebrow={`${user.orgName ?? "VibeCheck"} / account`}
        title={
          <>
            Security,
            <br />
            under your control.
          </>
        }
        description="Review where you are signed in, rotate your password, and add an authenticator. Staff handling client source should enable two-factor authentication."
      />

      {notice && <Notice message={notice} className="mb-5" />}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="sheet p-5">
            <SectionTitle
              eyebrow="Sessions"
              title="Where you are signed in"
              action={
                activeSessions.length > 1 ? (
                  <form action={revokeAllSessionsAction}>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      Sign out other sessions
                    </button>
                  </form>
                ) : (
                  <span className="font-mono text-[9px] text-muted">
                    {activeSessions.length} active
                  </span>
                )
              }
            />
            <div className="divide-y divide-line">
              {activeSessions.map((session) => {
                const current = session.id === user.sessionId;
                return (
                  <div
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-ink-soft">
                        <MonitorSmartphone size={14} aria-hidden />
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-semibold">
                            {current ? "This device" : "Signed-in device"}
                          </span>
                          {current && (
                            <span className="chip border-success/20 bg-success-soft text-success">
                              current
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 max-w-[420px] truncate text-[10.5px] text-muted">
                          {session.userAgent ?? "Unknown browser"}
                        </div>
                        <div className="mt-1 font-mono text-[9px] text-muted">
                          Seen {relativeTime(session.lastSeenAt)} · started{" "}
                          {formatDateTime(session.createdAt)}
                        </div>
                      </div>
                    </div>
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="sessionId" value={session.id} />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        {current ? "Sign out" : "Revoke"}
                      </button>
                    </form>
                  </div>
                );
              })}
              {activeSessions.length === 0 && (
                <p className="py-4 text-[11.5px] text-muted">
                  No active sessions were found.
                </p>
              )}
            </div>
          </section>

          <section className="sheet p-5">
            <SectionTitle eyebrow="Password" title="Change your password" />
            <PasswordForm />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="sheet p-5">
            <div className="flex items-center gap-2">
              <span
                className={`grid h-8 w-8 place-items-center rounded-full ${
                  mfaEnabled
                    ? "bg-success-soft text-success"
                    : "bg-paper-deep text-muted"
                }`}
              >
                {mfaEnabled ? (
                  <ShieldCheck size={15} aria-hidden />
                ) : (
                  <ShieldOff size={15} aria-hidden />
                )}
              </span>
              <div>
                <div className="mono-label">Two-factor authentication</div>
                <div className="text-[12px] font-semibold">
                  {mfaEnabled ? "On" : "Off"}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              {mfaEnabled
                ? `An authenticator code is required after your password. ${recoveryCodes.length} recovery code${
                    recoveryCodes.length === 1 ? "" : "s"
                  } remaining.`
                : "Add a second factor so a stolen password is not enough to reach client code."}
            </p>
            <div className="mt-4 space-y-3">
              {mfaEnabled ? (
                <>
                  <RecoveryCodesForm />
                  <div className="border-t border-line pt-3">
                    <MfaDisableForm />
                  </div>
                </>
              ) : (
                <form action={beginMfaSetupAction}>
                  <button type="submit" className="btn btn-primary w-full">
                    <ShieldCheck size={14} aria-hidden />
                    Set up authenticator
                  </button>
                </form>
              )}
              {mfaEnabled && (
                <p className="text-[10px] leading-relaxed text-muted">
                  Need to replace a lost device? Generate new recovery codes or ask
                  an operator to reset MFA from the database.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-dashed border-line-strong bg-card/60 p-5">
            <div className="mono-label">Last sign-in</div>
            <div className="mt-1.5 text-[12px] font-medium">
              {formatDateTime(record?.lastLoginAt)}
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
              Sessions are stored server-side. Revoking one takes effect on the
              next request. Password resets revoke every session.
            </p>
            <Link
              href="/account/security"
              className="mt-3 inline-block text-[10.5px] font-medium text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
            >
              Refresh session list
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
