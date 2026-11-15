"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { changePasswordAction, type FormState } from "@/app/actions/auth";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="currentPassword" className="field-label">
          Current password
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="field"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="field-label">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
            className="field"
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
            minLength={12}
            required
            autoComplete="new-password"
            className="field"
          />
        </div>
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted">
        At least 12 characters with a letter and a number. Other sessions are
        signed out after a change.
      </p>
      {state.error && (
        <div role="alert" className="text-[11.5px] text-critical">
          {state.error}
        </div>
      )}
      {state.success && (
        <div role="status" className="text-[11.5px] text-success">
          {state.success}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-secondary">
        <KeyRound size={14} aria-hidden />
        {pending ? "Updating…" : "Change password"}
      </button>
    </form>
  );
}
