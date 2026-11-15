import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Smartphone } from "lucide-react";
import { beginMfaSetupAction } from "@/app/actions/auth";
import { MfaEnrollForm } from "@/components/mfa-enroll-form";
import { PageHeader, SectionTitle } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadMfaSetup } from "@/lib/mfa-settings";

export const metadata: Metadata = { title: "Set up MFA" };

export default async function MfaSetupPage() {
  const user = await requireUser();
  const setup = await loadMfaSetup(user.id, user.email);
  if (setup?.enabled) redirect("/account/security");

  const grouped = setup
    ? setup.secret.match(/.{1,4}/g)?.join(" ") ?? setup.secret
    : null;

  return (
    <div className="mx-auto max-w-[760px]">
      <PageHeader
        eyebrow="Account / security"
        title="Add an authenticator."
        description="Use any TOTP app — 1Password, Authy, Google Authenticator, or a hardware token. The secret stays encrypted at rest and is never shown again after setup."
        actions={
          <Link href="/account/security" className="btn btn-secondary">
            <ArrowLeft size={14} aria-hidden />
            Security
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <section className="sheet p-5 md:p-6">
          {!setup ? (
            <>
              <SectionTitle eyebrow="Step 1" title="Generate a secret" />
              <p className="text-[12px] leading-relaxed text-muted">
                We will create a TOTP secret bound to your account. Nothing changes
                until you verify one code from the app.
              </p>
              <form action={beginMfaSetupAction} className="mt-5">
                <button type="submit" className="btn btn-primary">
                  <Smartphone size={14} aria-hidden />
                  Generate secret
                </button>
              </form>
            </>
          ) : (
            <>
              <SectionTitle eyebrow="Step 1" title="Add the account to your app" />
              <p className="text-[12px] leading-relaxed text-muted">
                Open your authenticator and add a new account. If the app supports
                setup URIs, paste the URI below; otherwise choose manual entry and
                use the secret.
              </p>
              <div className="mt-4 rounded-lg border border-line bg-paper p-3">
                <div className="mono-label text-[8px]">Secret</div>
                <div className="mt-1 select-all font-mono text-[14px] tracking-[0.12em]">
                  {grouped}
                </div>
              </div>
              <details className="mt-3 rounded-lg border border-line bg-card px-3 py-2.5">
                <summary className="cursor-pointer text-[11px] font-semibold">
                  Provisioning URI
                </summary>
                <code className="mt-2 block break-all font-mono text-[10px] leading-relaxed text-muted">
                  {setup.uri}
                </code>
              </details>

              <div className="mt-7 border-t border-line pt-5">
                <SectionTitle eyebrow="Step 2" title="Verify one code" />
                <MfaEnrollForm />
              </div>
            </>
          )}
        </section>

        <aside className="space-y-3">
          <div className="sheet p-4">
            <div className="mono-label">Why this matters</div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Analysts and operators can read client source and finalize reports.
              A password alone is not an acceptable control for those accounts.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-line-strong bg-card/60 p-4">
            <div className="mono-label">Recovery</div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              After verification you will receive ten single-use recovery codes.
              Store them offline. They are shown once.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
