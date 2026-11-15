"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const DEMO_ACCOUNTS = [
  {
    label: "Analyst",
    name: "Maya Chen",
    email: "analyst@vibecheck.dev",
    password: "Analyst123!",
    hint: "Triage queue & reports",
  },
  {
    label: "Freelancer",
    name: "Jordan Lee",
    email: "developer@vibecheck.dev",
    password: "Client123!",
    hint: "Scan and manage your projects",
  },
  {
    label: "Admin",
    name: "Operations",
    email: "admin@vibecheck.dev",
    password: "Admin123!",
    hint: "All engagements",
  },
];

export function LoginForm({ demoMode }: { demoMode: boolean }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    loginAction,
    {},
  );
  const [email, setEmail] = useState(demoMode ? "developer@vibecheck.dev" : "");
  const [password, setPassword] = useState(demoMode ? "Client123!" : "");

  return (
    <div>
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
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field"
            placeholder="you@company.com"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-[10.5px] font-medium text-muted hover:text-ink"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field"
            placeholder="••••••••"
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
            <LockKeyhole size={14} aria-hidden />
            {pending ? "Signing in…" : "Sign in"}
          </span>
          <ArrowRight size={15} aria-hidden />
        </button>
      </form>

      {demoMode && (
        <div className="mt-7 border-t border-line pt-5">
          <div className="mono-label mb-3">Demo accounts · local only</div>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                  email === account.email
                    ? "border-forest bg-forest text-paper"
                    : "border-line bg-card text-ink hover:border-line-strong"
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full font-mono text-[9px] ${
                      email === account.email
                        ? "bg-lime text-forest"
                        : "bg-paper-deep text-ink-soft"
                    }`}
                  >
                    {account.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="block text-[12px] font-semibold">
                      {account.label} — {account.name}
                    </span>
                    <span
                      className={`block text-[10.5px] ${
                        email === account.email ? "text-[#a8b8a9]" : "text-muted"
                      }`}
                    >
                      {account.email} · {account.hint}
                    </span>
                  </span>
                </span>
                <span
                  className={`font-mono text-[9px] ${
                    email === account.email ? "text-lime" : "text-muted"
                  }`}
                >
                  USE
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
            Demo mode is enabled by <code>DEMO_MODE=1</code>. Production accounts
            are created by operator invitation, not by this panel.
          </p>
        </div>
      )}
    </div>
  );
}
