import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Logo } from "@/components/logo";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { db } from "@/db";
import { invites, organizations } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { openAccess } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (openAccess()) redirect("/portal");
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const [row] = token
    ? await db
        .select({ invite: invites, organization: organizations })
        .from(invites)
        .leftJoin(organizations, eq(organizations.id, invites.orgId))
        .where(
          and(
            eq(invites.tokenHash, hashToken(token)),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .limit(1)
    : [];

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="sheet p-6 md:p-7">
          {row ? (
            <>
              <div className="mono-label">Invitation</div>
              <h1 className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.03em]">
                Set up your account.
              </h1>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                You are joining{" "}
                <span className="font-medium text-ink">
                  {row.organization?.name ?? "the VibeCheck analyst desk"}
                </span>{" "}
                as a{" "}
                {row.invite.role === "CLIENT"
                  ? "client"
                  : row.invite.role === "DEVELOPER"
                    ? "freelancer"
                    : "security analyst"}
                .
              </p>
              <div className="mt-6">
                <AcceptInviteForm
                  token={token}
                  email={row.invite.email}
                  name={row.invite.name}
                />
              </div>
            </>
          ) : (
            <>
              <div className="mono-label">Invitation unavailable</div>
              <h1 className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.03em]">
                This invitation cannot be used.
              </h1>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                It may have expired, already been accepted, or been revoked. Ask
                your VibeCheck operator to send a fresh invitation.
              </p>
              <Link href="/login" className="btn btn-secondary mt-6 w-full">
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
