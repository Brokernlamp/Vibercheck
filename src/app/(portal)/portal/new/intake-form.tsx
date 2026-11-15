"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight,
  FileArchive,
  GitBranch,
  LoaderCircle,
  ShieldAlert,
  ChevronDown,
} from "lucide-react";
import {
  createEngagementAction,
  type CreateEngagementState,
} from "@/app/actions/engagements";
import { TIERS, TIER_ORDER, formatMoney, type AuditTier } from "@/lib/domain";

export function IntakeForm({
  freeMode,
  allowSample,
  selfService,
}: {
  freeMode: boolean;
  allowSample: boolean;
  selfService: boolean;
}) {
  const [state, formAction, pending] = useActionState<CreateEngagementState, FormData>(
    createEngagementAction,
    {},
  );
  const [tier, setTier] = useState<AuditTier>("QUICK_SCAN");
  const [sourceMode, setSourceMode] = useState<"sample" | "zip" | "github">(
    allowSample ? "sample" : "zip",
  );
  const [showContext, setShowContext] = useState(false);

  const sources = [
    ...(allowSample
      ? [{ key: "sample" as const, label: "Demo repo", icon: ShieldAlert, desc: "Intentionally vulnerable fixture — best for exploring the workflow" }]
      : []),
    { key: "zip" as const, label: "Upload ZIP", icon: FileArchive, desc: "Any repository archive, including private GitLab or repos without App access" },
    { key: "github" as const, label: "GitHub / GitLab", icon: GitBranch, desc: "Public repositories, or private GitHub repositories with the VibeCheck App installed" },
  ];

  return (
    <form action={formAction} className="space-y-6">

      {/* Step 1 — Name */}
      <div>
        <label htmlFor="name" className="field-label">
          {selfService ? "What are you scanning?" : "What are we auditing?"}
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={90}
          className="field text-[15px]"
          placeholder="e.g. My SaaS dashboard"
          autoFocus
        />
        <p className="field-help">This name appears on your report.</p>
      </div>

      {/* Step 2 — Source */}
      <div>
        <p className="field-label">Source</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {sources.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSourceMode(option.key)}
              className={`flex flex-col gap-2.5 rounded-xl border p-3.5 text-left transition ${
                sourceMode === option.key
                  ? "border-forest bg-forest text-paper"
                  : "border-line bg-card text-ink hover:border-line-strong"
              }`}
            >
              <option.icon
                size={16}
                className={sourceMode === option.key ? "text-lime" : "text-muted"}
                aria-hidden
              />
              <div>
                <p className="text-[12px] font-semibold">{option.label}</p>
                <p className={`mt-0.5 text-[10.5px] leading-snug ${sourceMode === option.key ? "text-[#aebdaf]" : "text-muted"}`}>
                  {option.desc}
                </p>
              </div>
            </button>
          ))}
        </div>
        <input type="hidden" name="sourceMode" value={sourceMode} />

        {sourceMode === "zip" && (
          <div className="mt-3">
            <label htmlFor="archive" className="field-label">Repository archive</label>
            <input
              id="archive"
              name="archive"
              type="file"
              accept=".zip,application/zip"
              className="field file:mr-3 file:rounded file:border-0 file:bg-paper-deep file:px-2.5 file:py-1 file:text-[11px] file:font-semibold"
            />
            <p className="field-help">Max 25 MB. node_modules, .git, and build output are skipped automatically.</p>
          </div>
        )}

        {sourceMode === "github" && (
          <div className="mt-3">
            <label htmlFor="repoUrl" className="field-label">Repository URL</label>
            <input
              id="repoUrl"
              name="repoUrl"
              type="url"
              className="field"
              placeholder="https://github.com/owner/repository"
            />
            <p className="field-help">Public GitHub/GitLab repos work directly. Private GitHub repos require the VibeCheck GitHub App to be configured and installed for the repository.</p>
          </div>
        )}
        {sourceMode === "github" && (
          <div className="mt-3">
            <label htmlFor="ciFailurePolicy" className="field-label">
              Push scan policy
            </label>
            <select
              id="ciFailurePolicy"
              name="ciFailurePolicy"
              className="field"
              defaultValue="REPORT_ONLY"
            >
              <option value="REPORT_ONLY">Report findings — do not block</option>
              <option value="BLOCK_HIGH">Block critical and high findings</option>
              <option value="BLOCK_ANY">Block on any finding</option>
            </select>
            <p className="field-help">
              Applies to GitHub repositories connected through the VibeCheck App. GitLab currently receives the initial scan only. Enable the check as required in GitHub branch protection to block merges.
            </p>
          </div>
        )}
      </div>

      {!selfService && (
      <div>
        <p className="field-label">Audit tier</p>
        <div className="grid gap-2">
          {TIER_ORDER.map((key) => {
            const details = TIERS[key];
            const selected = tier === key;
            return (
              <label
                key={key}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition ${
                  selected
                    ? "border-forest bg-forest text-paper"
                    : "border-line bg-card hover:border-line-strong"
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  value={key}
                  checked={selected}
                  onChange={() => setTier(key)}
                  className="accent-[#c9f45b]"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{details.label}</span>
                    <span className={`font-mono text-[11px] ${selected ? "text-lime" : "text-ink"}`}>
                      {freeMode ? "Free" : formatMoney(details.priceCents)}
                      <span className={`ml-1 text-[9px] font-normal ${selected ? "text-[#9fb39f]" : "text-muted"}`}>
                        {freeMode ? "early access" : details.cadence === "monthly" ? "/mo" : "once"}
                      </span>
                    </span>
                  </div>
                  <p className={`mt-0.5 text-[11px] leading-snug ${selected ? "text-[#b8c8b9]" : "text-muted"}`}>
                    {details.blurb} · {details.turnaround} turnaround
                  </p>
                </div>
              </label>
            );
          })}
        </div>
        {freeMode && (
          <p className="field-help">Every tier is free during early access. No card required.</p>
        )}
      </div>
      )}

      {/* Step 4 — Context (collapsed by default) */}
      <div className="rounded-xl border border-line bg-card/60">
        <button
          type="button"
          onClick={() => setShowContext(!showContext)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
        >
          <span className="text-[12px] font-semibold text-ink-soft">
            {selfService ? "Add project context" : "Add context for the analyst"}
            <span className="ml-2 font-normal text-muted">
              {selfService
                ? "(optional)"
                : "(optional — helps with triage)"}
            </span>
          </span>
          <ChevronDown
            size={14}
            className={`text-muted transition-transform ${showContext ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {showContext && (
          <div className="space-y-3 border-t border-line px-4 pb-4 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="stack" className="field-label">Stack</label>
                <input
                  id="stack"
                  name="stack"
                  className="field"
                  placeholder="Next.js, Postgres, Stripe"
                />
                <p className="field-help">Auto-detected after scan if left blank.</p>
              </div>
              <div>
                <label htmlFor="deploymentTarget" className="field-label">Deployment target</label>
                <input
                  id="deploymentTarget"
                  name="deploymentTarget"
                  className="field"
                  placeholder="Vercel + Supabase"
                />
              </div>
            </div>
            <div>
              <label htmlFor="compliance" className="field-label">Compliance context</label>
              <input
                id="compliance"
                name="compliance"
                className="field"
                placeholder="Pre-SOC 2, handling payment data, HIPAA adjacent…"
              />
            </div>
            <div>
              <label htmlFor="notes" className="field-label">
                {selfService ? "Notes about this project" : "Anything the analyst should know?"}
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="field resize-y"
                placeholder="Recent AI-assisted rewrite, known risky areas, launch date, or a specific threat you're worried about."
              />
            </div>
          </div>
        )}
      </div>

      {state.error && (
        <div
          role="alert"
          className="rounded-lg border border-critical/25 bg-critical-soft px-3.5 py-2.5 text-[12px] text-critical"
        >
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10.5px] leading-relaxed text-muted">
          {selfService
            ? "Automated scan results are not human-reviewed."
            : "You accept the report terms before anything is delivered."}
          <br />
          Your source is never used to train any model.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary shrink-0"
        >
          {pending ? (
            <>
              <LoaderCircle size={14} className="animate-spin" aria-hidden />
              Ingesting source…
            </>
          ) : (
            <>
              {selfService ? "Start scan" : `Start ${TIERS[tier].shortLabel} audit`}
              <ArrowRight size={14} aria-hidden />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
