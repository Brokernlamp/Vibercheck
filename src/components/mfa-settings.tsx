"use client";

import { useActionState } from "react";
import { RefreshCw, ShieldOff } from "lucide-react";
import {
  disableMfaAction,
  regenerateRecoveryCodesAction,
  type FormState,
} from "@/app/actions/auth";

export function MfaDisableForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    disableMfaAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="disable-password" className="field-label">
            Password
          </label>
          <input
            id="disable-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="disable-code" className="field-label">
            Authenticator code
          </label>
          <input
            id="disable-code"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            className="field font-mono tracking-[0.18em]"
            placeholder="123456"
          />
        </div>
      </div>
      {state.error && <div role="alert" className="text-[11.5px] text-critical">{state.error}</div>}
      {state.success && <div role="status" className="text-[11.5px] text-success">{state.success}</div>}
      <button type="submit" disabled={pending} className="btn btn-secondary">
        <ShieldOff size={14} aria-hidden />
        {pending ? "Turning off…" : "Turn off two-factor authentication"}
      </button>
    </form>
  );
}

type RecoveryState = FormState & { recoveryCodes?: string[] };

export function RecoveryCodesForm() {
  const [state, formAction, pending] = useActionState<RecoveryState, FormData>(
    regenerateRecoveryCodesAction,
    {},
  );
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="recovery-password" className="field-label">
          Password
        </label>
        <input
          id="recovery-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </div>
      {state.error && <div role="alert" className="text-[11.5px] text-critical">{state.error}</div>}
      {state.recoveryCodes && state.recoveryCodes.length > 0 && (
        <div>
          <div className="text-[11.5px] text-success">{state.success}</div>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-line bg-paper p-3 font-mono text-[11px]">
            {state.recoveryCodes.map((code) => (
              <span key={code} className="select-all">
                {code}
              </span>
            ))}
          </div>
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-secondary">
        <RefreshCw size={14} aria-hidden />
        {pending ? "Generating…" : "Generate new recovery codes"}
      </button>
    </form>
  );
}
