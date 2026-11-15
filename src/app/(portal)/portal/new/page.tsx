import type { Metadata } from "next";
import { Check, Clock3, LockKeyhole, UserCheck } from "lucide-react";
import { allowSampleSource, isFreeMode, soloMode } from "@/lib/env";
import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: soloMode() ? "New scan" : "New project" };

export default function NewAuditPage() {
  const isSolo = soloMode();
  return (
    <div>
      <div className="mb-8">
        <div className="mono-label mb-2.5">{isSolo ? "New scan" : "New project"}</div>
        <h1 className="font-serif text-[36px] leading-[1.03] tracking-[-0.035em] md:text-[44px]">
          Scan your project.
          <br />
          We handle the rest.
        </h1>
        <p className="mt-3 max-w-[560px] text-[13px] leading-relaxed text-muted">
          {isSolo
            ? "Takes a minute to set up. Results are unlocked automatically after the scan."
            : "Takes a minute to set up. The automated pass runs first; an analyst then validates every finding before a report becomes visible."}
        </p>
      </div>

      <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
        <div className="sheet p-5 md:p-7">
          <IntakeForm
            freeMode={isFreeMode()}
            allowSample={allowSampleSource()}
            selfService={isSolo}
          />
        </div>

        <aside className="space-y-3">
          <div className="sheet p-5">
            <div className="mono-label">What happens next</div>
            <ol className="mt-4 space-y-4">
              {[
                {
                  icon: Clock3,
                  title: "Ingest + scan",
                  body: "Source snapshot, safe extraction, automated rules and dependency review.",
                },
                {
                  icon: isSolo ? Check : UserCheck,
                  title: isSolo ? "Results unlocked" : "Analyst review",
                  body: isSolo
                    ? "Results are available immediately after scanning."
                    : "Confirm, dismiss, edit, or add findings. Sign-off is mandatory.",
                },
                {
                  icon: isSolo ? Check : LockKeyhole,
                  title: isSolo ? "Ready to use" : "Final report",
                  body: isSolo
                    ? "Your report is ready to view and remediate."
                    : "You accept the terms, then receive the immutable report.",
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-paper text-ink-soft">
                    <item.icon size={13} aria-hidden />
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold">{item.title}</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="border border-dashed border-line-strong bg-card/60 p-5">
            <div className="mono-label">Scope reminder</div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Static review only. No penetration test, no exploitation, no
              compliance certification. Re-scan verifies fixes; it does not
              guarantee a risk-free codebase.
            </p>
            <div className="mt-3 flex items-start gap-2 text-[10.5px] text-ink-soft">
              <Check size={12} className="mt-0.5 text-success" aria-hidden />
              No model training on your code.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
