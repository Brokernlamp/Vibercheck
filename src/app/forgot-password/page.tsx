import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { getCurrentUser, homeForRole } from "@/lib/auth";
import { openAccess } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  if (openAccess()) redirect("/portal");
  const user = await getCurrentUser();
  if (user) redirect(homeForRole(user.role));

  return (
    <div className="grid min-h-screen place-items-center bg-paper px-5 py-10">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="sheet p-6 md:p-7">
          <div className="mono-label">Account recovery</div>
          <h1 className="mt-2 font-serif text-[30px] leading-tight tracking-[-0.03em]">
            Reset your password.
          </h1>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            Enter the email on your account. If it exists, we will send a
            single-use reset link. The response is the same either way.
          </p>
          <div className="mt-6">
            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </div>
  );
}
