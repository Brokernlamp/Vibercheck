"use client";

import { useActionState, useEffect, useState } from "react";
import { MailPlus } from "lucide-react";
import { inviteUserAction } from "@/app/actions/invites";
import type { FormState } from "@/app/actions/auth";

export function InviteUserForm({
  organizations,
  selfService,
}: {
  organizations: Array<{ id: string; name: string }>;
  selfService: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    inviteUserAction,
    {},
  );
  const [role, setRole] = useState<"CLIENT" | "DEVELOPER" | "ANALYST">(
    selfService ? "DEVELOPER" : "CLIENT",
  );
  const hasWorkspace = role === "CLIENT" || role === "DEVELOPER";

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-name" className="field-label">
            Full name
          </label>
          <input
            id="invite-name"
            name="name"
            required
            minLength={2}
            maxLength={120}
            className="field"
            placeholder="Jordan Lee"
          />
        </div>
        <div>
          <label htmlFor="invite-email" className="field-label">
            Work email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            className="field"
            placeholder="jordan@company.com"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="invite-role" className="field-label">
            Role
          </label>
          <select
            id="invite-role"
            name="role"
            className="field"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "CLIENT" | "DEVELOPER" | "ANALYST")
            }
          >
            {selfService ? (
              <option value="DEVELOPER">Freelancer</option>
            ) : (
              <option value="CLIENT">Client</option>
            )}
            <option value="ANALYST">Security analyst</option>
          </select>
        </div>
        <div>
          <label htmlFor="invite-org" className="field-label">
            Workspace
          </label>
          <select
            id="invite-org"
            name="orgId"
            className="field"
            required={hasWorkspace}
            disabled={!hasWorkspace}
          >
            {hasWorkspace ? (
              <>
                <option value="">Choose a tenant…</option>
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </>
            ) : (
              <option value="">VibeCheck staff</option>
            )}
          </select>
        </div>
      </div>
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
      {state.invitePath && <InviteLink path={state.invitePath} />}
      <button type="submit" disabled={pending} className="btn btn-primary">
        <MailPlus size={14} aria-hidden />
        {pending ? "Sending invitation…" : "Send invitation"}
      </button>
    </form>
  );
}

/**
 * Without a mail provider configured, the invite is written to a private local
 * outbox instead of being sent. Showing the link lets the admin pass it to a
 * tester directly instead of being blocked on email setup.
 */
function InviteLink({ path }: { path: string }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = `${origin}${path}`;

  return (
    <div className="rounded-lg border border-line bg-paper-deep p-3">
      <p className="text-[11px] leading-relaxed text-ink-soft">
        Email is in preview mode, so nothing was sent. Share this invitation link
        directly — it expires in 7 days and works once.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          value={url}
          aria-label="Invitation link"
          onFocus={(event) => event.currentTarget.select()}
          className="field font-mono text-[11px]"
        />
        <button
          type="button"
          className="btn shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
