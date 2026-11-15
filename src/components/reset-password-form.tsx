"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
import { resetPasswordAction, type FormState } from "@/app/actions/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    resetPasswordAction,
    {},
  );

  if (state.success) {
    return (
      <div>
        <div className="rounded-lg border border-success/25 bg-success-soft px-3.5 py-3 text-[12.5px] leading-relaxed text-success">
          {state.success}
        </div>
        <Link href="/login" className="btn btn-primary mt-5 w-full justify-between">
          Sign in
          <ArrowRight size={15} aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="field-label">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="field"
          placeholder="At least 12 characters"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="field-label">
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className="field"
          placeholder="Repeat the password"
        />
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted">
        At least 12 characters with a letter and a number. Resetting signs out
        every other session.
      </p>
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
          <KeyRound size={14} aria-hidden />
          {pending ? "Updating…" : "Set new password"}
        </span>
        <ArrowRight size={15} aria-hidden />
      </button>
    </form>
  );
}
