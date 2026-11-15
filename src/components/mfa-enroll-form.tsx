"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { enableMfaAction, type FormState } from "@/app/actions/auth";

type State = FormState & { recoveryCodes?: string[] };

export function MfaEnrollForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    enableMfaAction,
    {},
  );

  if (state.recoveryCodes && state.recoveryCodes.length > 0) {
    return (
      <div>
        <div className="rounded-lg border border-success/25 bg-success-soft px-3.5 py-3 text-[12px] leading-relaxed text-success">
          {state.success}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
          Save these codes somewhere offline. Each works once if you lose your
          authenticator. They will not be shown again.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-line bg-paper p-3 font-mono text-[11.5px]">
          {state.recoveryCodes.map((code) => (
            <span key={code} className="select-all">
              {code}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="code" className="field-label">
          Six-digit code from your app
        </label>
        <input
          id="code"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          className="field font-mono tracking-[0.18em]"
          placeholder="123456"
        />
      </div>
      {state.error && (
        <div role="alert" className="text-[11.5px] text-critical">
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary">
        <ShieldCheck size={14} aria-hidden />
        {pending ? "Verifying…" : "Turn on two-factor authentication"}
      </button>
    </form>
  );
}
