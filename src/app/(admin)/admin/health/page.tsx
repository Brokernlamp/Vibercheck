import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  ScanSearch,
  Server,
  XCircle,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { dataDir, scanExecution } from "@/lib/env";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Local health" };

// Fetch status from the API route so the page and the API share the same logic.
async function fetchStatus() {
  try {
    const base = process.env.APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/status`, {
      cache: "no-store",
      headers: { "x-internal-health-check": "1" },
    });
    return res.json() as Promise<{
      ok: boolean;
      latencyMs: number;
      scanExecution: string;
      queue: { queued: number; running: number } | null;
      subsystems: Record<
        string,
        { ok: boolean; status: string; detail?: string; action?: string }
      >;
    }>;
  } catch {
    return null;
  }
}

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 size={16} className="text-success" aria-hidden />
  ) : (
    <XCircle size={16} className="text-critical" aria-hidden />
  );
}

const SUBSYSTEM_ICONS = {
  database: Database,
  worker: Server,
  scanner: ScanSearch,
  storage: HardDrive,
};

const SUBSYSTEM_LABELS: Record<string, string> = {
  database: "PostgreSQL database",
  worker: "Scan worker",
  scanner: "Detection engine",
  storage: "Source storage",
};

export default async function LocalHealthPage() {
  await requireAdmin();
  const data = await fetchStatus();

  return (
    <div>
      <PageHeader
        eyebrow="Local environment · not a production monitor"
        title="System health"
        description="Checks database connectivity, worker heartbeat, scanner readiness, and storage access. All services must be green before running scans."
        actions={
          <Link href="/admin" className="btn btn-secondary">
            Back to operations
          </Link>
        }
      />

      {!data ? (
        <div className="sheet p-6">
          <div className="flex items-center gap-3 text-critical">
            <AlertTriangle size={18} aria-hidden />
            <span className="font-semibold">
              Could not reach the status API. The app may still be starting.
            </span>
          </div>
          <p className="mt-2 text-[12px] text-muted">
            Reload the page in a few seconds. If this persists, check that the
            Next.js dev server is running and DATABASE_URL is set in .env.local.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3">
            <Activity size={16} className={data.ok ? "text-success" : "text-critical"} aria-hidden />
            <span className="text-[13px] font-semibold">
              {data.ok ? "All systems operational" : "One or more systems need attention"}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted">
              {data.latencyMs}ms · {data.scanExecution} mode
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(data.subsystems).map(([key, sub]) => {
              const Icon = SUBSYSTEM_ICONS[key as keyof typeof SUBSYSTEM_ICONS] ?? Server;
              return (
                <div
                  key={key}
                  className={`sheet p-5 ${!sub.ok ? "border-critical/40 bg-critical-soft/20" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon size={15} className="text-ink-soft" aria-hidden />
                      <span className="text-[12.5px] font-semibold">
                        {SUBSYSTEM_LABELS[key] ?? key}
                      </span>
                    </div>
                    <StatusIcon ok={sub.ok} />
                  </div>
                  <div className="mt-2 font-mono text-[10px] text-muted">
                    {sub.status}
                  </div>
                  {sub.detail && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                      {sub.detail}
                    </p>
                  )}
                  {sub.action && !sub.ok && (
                    <div className="mt-3 rounded border border-warning/40 bg-warning-soft/30 px-3 py-2 text-[11px] leading-relaxed text-ink">
                      <span className="font-semibold">Action: </span>
                      {sub.action}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {data.queue && (
            <div className="mt-4 sheet p-4">
              <div className="mono-label mb-2">Scan queue</div>
              <div className="flex gap-6 text-[12px]">
                <span>
                  <span className="font-semibold">{data.queue.queued}</span>
                  <span className="ml-1 text-muted">queued</span>
                </span>
                <span>
                  <span className="font-semibold">{data.queue.running}</span>
                  <span className="ml-1 text-muted">running</span>
                </span>
              </div>
            </div>
          )}

          <div className="mt-6 rounded border border-dashed border-line-strong bg-card/60 p-4 text-[11px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">Local-only note: </span>
            This page is for local development and demos. It is not a
            production monitoring dashboard. Data directory:{" "}
            <code className="rounded bg-paper-deep px-1 font-mono text-[9px]">
              {dataDir()}
            </code>
            . Scan mode:{" "}
            <code className="rounded bg-paper-deep px-1 font-mono text-[9px]">
              {scanExecution()}
            </code>
            .
          </div>
        </>
      )}
    </div>
  );
}
