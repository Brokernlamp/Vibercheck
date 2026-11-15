import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness only. Dependencies are covered by /api/ready. */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "vibecheck", engine: "vibecheck-engine/0.1.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
