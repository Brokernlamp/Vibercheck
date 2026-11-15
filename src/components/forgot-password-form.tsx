"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { forgotPasswordAction, type FormState } from "@/app/actions/auth";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    forgotPasswordAction,
    {},
  );

  if (state.success) {
    return (
      <div>
        <div className="rounded-lg border border-success/25 bg-success-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-success">
          {state.success}
        </div>
        <p className="mt-5 text-[11.5px] leading-relaxed text-muted">
          The link expires in one hour and can be used once. Check spam if it does
          not arrive within a few minutes.
        </p>
        <Link href="/login" className="btn btn-secondary mt-5 w-full">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="field-label">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="field"
          placeholder="you@company.com"
        />
      </div>
      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3 py-2 text-[12px] text-critical"
        >
          {state.error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary w-full justify-between"
      >
        <span className="inline-flex items-center gap-2">
          <Mail size={14} aria-hidden />
          {pending ? "Sending…" : "Send reset link"}
        </span>
        <ArrowRight size={15} aria-hidden />
      </button>
      <Link
        href="/login"
        className="block pt-1 text-center text-[11px] font-medium text-muted hover:text-ink"
      >
        Back to sign in
      </Link>
    </form>
  );
}
