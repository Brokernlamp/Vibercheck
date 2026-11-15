import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Logo } from "@/components/logo";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { db } from "@/db";
import { passwordResetTokens, users } from "@/db/schema";
import { hashToken } from "@/lib/crypto";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const [row] = token
    ? await db
        .select({ user: users })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(
          and(
            eq(passwordResetTokens.tokenHash, hashToken(token)),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
            eq(users.isActive, true),
          ),
        )
        .limit(1)
    : [];

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="sheet p-6 md:p-7">
          {row ? (
            <>
              <div className="mono-label">Account recovery</div>
              <h1 className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.03em]">
                Choose a new password.
              </h1>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Resetting the password for{" "}
                <span className="font-medium text-ink">{row.user.email}</span>.
              </p>
              <div className="mt-6">
                <ResetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <>
              <div className="mono-label">Link unavailable</div>
              <h1 className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.03em]">
                This reset link cannot be used.
              </h1>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                Reset links expire after one hour, can be used once, and are
                revoked when a new one is requested.
              </p>
              <Link href="/forgot-password" className="btn btn-primary mt-6 w-full">
                Request a new link
              </Link>
              <Link
                href="/login"
                className="mt-4 block text-center text-[11px] font-medium text-muted hover:text-ink"
              >
                Back to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
