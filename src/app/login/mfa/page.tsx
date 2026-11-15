import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { MfaLoginForm } from "@/components/mfa-login-form";
import { readMfaChallenge } from "@/lib/auth-challenge";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { openAccess } from "@/lib/env";

export const metadata: Metadata = { title: "Two-factor sign in" };

export default async function MfaLoginPage() {
  if (openAccess()) redirect("/portal");
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));
  const challenge = await readMfaChallenge();
  if (!challenge) redirect("/login");

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={12} aria-hidden />
            Start over
          </Link>
        </div>
        <div className="sheet p-6 md:p-7">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-lime">
              <ShieldCheck size={16} aria-hidden />
            </span>
            <div>
              <div className="mono-label">Second factor</div>
              <h1 className="font-serif text-[26px] leading-tight tracking-[-0.03em]">
                Confirm it is you.
              </h1>
            </div>
          </div>
          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            Your password checked out. Enter a current authenticator code to finish
            signing in. This challenge expires in ten minutes.
          </p>
          <div className="mt-6">
            <MfaLoginForm />
          </div>
        </div>
        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
          Lost your device? Use a recovery code. If those are gone too, ask your
          operator to reset the second factor.
        </p>
      </div>
    </div>
  );
}
