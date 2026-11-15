import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { dataDir, scanExecution } from "@/lib/env";
import { queueStats, workerHeartbeatAgeSeconds } from "@/lib/scan-queue";
import { customRules } from "@/lib/scan/rules";
import { secretRules } from "@/lib/scan/secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubsystemStatus {
  ok: boolean;
  status: string;
  detail?: string;
  action?: string;
}

async function checkDatabase(): Promise<SubsystemStatus> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true, status: "reachable" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      status: "unreachable",
      detail: msg.slice(0, 200),
      action:
        "Ensure PostgreSQL is running and DATABASE_URL is correct. Run: createdb vibecheck && npm run db:push",
    };
  }
}

async function checkWorker(): Promise<SubsystemStatus> {
  const mode = scanExecution();
  if (mode === "inline") {
    return {
      ok: true,
      status: "inline",
      detail: "Scans run inside the Next.js process (SCAN_EXECUTION=inline).",
    };
  }
  const age = await workerHeartbeatAgeSeconds();
  if (age === null) {
    return {
      ok: false,
      status: "never_seen",
      detail: "No worker heartbeat recorded. The worker has not started.",
      action: "Run: npm run worker (in a separate terminal)",
    };
  }
  if (age > 60) {
    return {
      ok: false,
      status: `stale_${Math.round(age)}s`,
      detail: `Last heartbeat was ${Math.round(age)} seconds ago (threshold: 60s).`,
      action:
        "Restart the worker: npm run worker. Stale scans will be requeued automatically.",
    };
  }
  return {
    ok: true,
    status: "healthy",
    detail: `Last heartbeat ${Math.round(age)}s ago.`,
  };
}

async function checkScanner(): Promise<SubsystemStatus> {
  const ruleCount = customRules.length + secretRules.length;
  return {
    ok: true,
    status: "ready",
    detail: `${ruleCount} rules loaded (${customRules.length} AI/MCP + ${secretRules.length} secret + SCA/license).`,
  };
}

async function checkStorage(): Promise<SubsystemStatus> {
  const dir = path.resolve(dataDir());
  try {
    await fs.mkdir(dir, { recursive: true });
    const testFile = path.join(dir, ".write-test");
    await fs.writeFile(testFile, "ok");
    await fs.unlink(testFile);
    return {
      ok: true,
      status: "writable",
      detail: `Data directory: ${dir}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    return {
      ok: false,
      status: "not_writable",
      detail: msg.slice(0, 200),
      action: `Ensure the process can write to ${dir}. Check DATA_DIR in .env.local.`,
    };
  }
}

export async function GET() {
  const started = Date.now();

  const [database, worker, scanner, storage] = await Promise.all([
    checkDatabase(),
    checkWorker(),
    checkScanner(),
    checkStorage(),
  ]);

  let queue = null;
  if (database.ok) {
    try {
      queue = await queueStats();
    } catch {
      // Non-fatal; DB check already covers connectivity.
    }
  }

  const allOk = database.ok && worker.ok && scanner.ok && storage.ok;

  return NextResponse.json(
    {
      ok: allOk,
      latencyMs: Date.now() - started,
      subsystems: { database, worker, scanner, storage },
      queue,
      scanExecution: scanExecution(),
    },
    {
      status: allOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
