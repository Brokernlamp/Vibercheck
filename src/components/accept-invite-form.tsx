"use client";

import { useActionState } from "react";
import { ArrowRight, UserCheck } from "lucide-react";
import { acceptInviteAction, type FormState } from "@/app/actions/auth";

export function AcceptInviteForm({
  token,
  email,
  name,
}: {
  token: string;
  email: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    acceptInviteAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="name" className="field-label">
          Full name
        </label>
        <input
          id="name"
          name="name"
          defaultValue={name}
          minLength={2}
          maxLength={120}
          required
          className="field"
          autoComplete="name"
        />
      </div>
      <div>
        <label className="field-label">Email</label>
        <div className="rounded-lg border border-line bg-paper-deep px-3 py-2.5 font-mono text-[12px] text-ink-soft">
          {email}
        </div>
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Create a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          minLength={12}
          required
          autoComplete="new-password"
          className="field"
          placeholder="At least 12 characters"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="field-label">
          Confirm password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minLength={12}
          required
          autoComplete="new-password"
          className="field"
          placeholder="Repeat the password"
        />
      </div>
      <p className="text-[10.5px] leading-relaxed text-muted">
        At least 12 characters with a letter and a number. This invitation can be
        used once and expires seven days after it was sent.
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
          <UserCheck size={14} aria-hidden />
          {pending ? "Activating…" : "Activate account"}
        </span>
        <ArrowRight size={15} aria-hidden />
      </button>
    </form>
  );
}
