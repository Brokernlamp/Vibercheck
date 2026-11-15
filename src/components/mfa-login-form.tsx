"use client";

import { useActionState } from "react";
import { ArrowRight, KeyRound } from "lucide-react";
import { verifyMfaAction, type LoginState } from "@/app/actions/auth";

export function MfaLoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    verifyMfaAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="code" className="field-label">
          Authenticator or recovery code
        </label>
        <input
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode="text"
          className="field font-mono text-[16px] tracking-[0.18em]"
          placeholder="123 456"
        />
        <p className="field-help">
          Enter the six-digit code from your authenticator app, or one unused
          recovery code.
        </p>
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
          <KeyRound size={14} aria-hidden />
          {pending ? "Verifying…" : "Verify and sign in"}
        </span>
        <ArrowRight size={15} aria-hidden />
      </button>
    </form>
  );
}
