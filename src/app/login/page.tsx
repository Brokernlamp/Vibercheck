import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { demoMode, openAccess } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (openAccess()) redirect("/portal");
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));
  const params = await searchParams;
  const reset = params.reset === "1";
  const showDemo = demoMode();

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden border-r border-[#27372d] bg-forest p-10 text-paper lg:flex lg:flex-col">
        <div className="relative z-10">
          <Logo href="/" inverted />
        </div>
        <div className="relative z-10 my-auto max-w-[500px] py-10">
          <div className="mono-label text-[#8ea192]">VIBECHECK / WORKSPACE</div>
          <h1 className="display mt-6 text-[58px] leading-[0.98]">
            The model is not
            <br />
            the threat model.
          </h1>
          <p className="mt-5 max-w-[420px] text-[13.5px] leading-relaxed text-[#afbfb0]">
            Automated scanning finds the patterns. A human analyst decides what
            is real. Triage, sign-off, report, remediation, re-scan.
          </p>

          <div className="mt-9 space-y-2.5">
            {[
              "29 named AI-code, MCP, secret, and dependency checks",
              "Raw secrets redacted before storage",
              "No report escapes without analyst sign-off",
              "Re-scan diff shows resolved vs outstanding",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-[12px] text-[#d2dbd1]">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#1e2b23] text-lime">
                  <Check size={11} aria-hidden />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 border-t border-[#2b3a30] pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.1em] text-[#8ea192]">
              <ShieldCheck size={12} aria-hidden />
              Invitation-only access
            </div>
            <div className="stamp rotate-1 text-[#8fa08f]">Early access</div>
          </div>
        </div>

        <div className="pointer-events-none absolute -bottom-28 -right-28 h-80 w-80 rounded-full border border-[#2c3c31]" />
        <div className="pointer-events-none absolute -bottom-16 -right-16 h-52 w-52 rounded-full border border-[#334537]" />
        <div className="pointer-events-none absolute right-10 top-24 h-2 w-2 bg-lime" />
      </aside>

      <main className="flex flex-col px-5 py-6 md:px-10 md:py-8">
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <Logo href="/" />
          </div>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-ink"
          >
            <ArrowLeft size={12} aria-hidden />
            Back to site
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <div className="mono-label">Welcome back</div>
          <h2 className="display mt-3 text-[44px]">Sign in to the desk.</h2>
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
            {showDemo
              ? "Local demo mode. Use a seeded account below, or a real invitation."
              : "Use the account you activated from your invitation email."}
          </p>
          {reset && (
            <div className="mt-5 rounded-lg border border-success/25 bg-success-soft px-3 py-2 text-[12px] text-success">
              Password updated. Sign in with the new password.
            </div>
          )}
          <div className="mt-8">
            <LoginForm demoMode={showDemo} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px] border-t border-line pt-4 text-[10px] leading-relaxed text-muted">
          Sessions are HTTP-only and revocable from Security &amp; sessions.
          Passwords are scrypt-hashed; staff accounts can require an authenticator
          code.
        </div>
      </main>
    </div>
  );
}
