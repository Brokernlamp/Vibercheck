import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { scanExecution } from "@/lib/env";
import {
  queueStats,
  workerHeartbeatAgeSeconds,
} from "@/lib/scan-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
  } catch {
    return NextResponse.json(
      { ok: false, database: "unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stats = await queueStats();
  if (scanExecution() === "worker") {
    const age = await workerHeartbeatAgeSeconds();
    if (age === null || age > 60) {
      return NextResponse.json(
        {
          ok: false,
          database: "reachable",
          scanWorker:
            age === null ? "never_seen" : `stale_${Math.round(age)}s`,
          queue: stats,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  return NextResponse.json(
    {
      ok: true,
      database: "reachable",
      scanExecution: scanExecution(),
      queue: stats,
      latencyMs: Date.now() - started,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
