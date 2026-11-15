"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { engagements, scanRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { purgeSource } from "@/lib/ingest";
import { redirectWithError } from "@/lib/navigation";

function field(formData: FormData, name: string, max = 500): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

export async function purgeEngagementSourcesAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const engagementId = field(formData, "engagementId", 64);

  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) redirectWithError("/admin", "Engagement not found.");

  const scans = await db
    .select()
    .from(scanRuns)
    .where(eq(scanRuns.engagementId, engagementId));

  let purged = 0;
  for (const scan of scans) {
    if (!scan.sourcePath || scan.sourcePurgedAt) continue;
    try {
      await purgeSource(scan.sourcePath);
      await db
        .update(scanRuns)
        .set({ sourcePath: null, sourcePurgedAt: new Date() })
        .where(eq(scanRuns.id, scan.id));
      purged += 1;
    } catch (error) {
      console.error("source_purge_failed", scan.id, error);
      redirectWithError(
        `/admin/engagements/${engagementId}`,
        "One or more source directories could not be purged.",
      );
    }
  }

  await writeAudit({
    actor: admin,
    action: "source.purged",
    orgId: engagement.orgId,
    engagementId,
    detail: { scansPurged: purged },
  });
  revalidatePath(`/admin/engagements/${engagementId}`);
  redirect(
    `/admin/engagements/${engagementId}?notice=${encodeURIComponent(
      `${purged} source snapshot${purged === 1 ? "" : "s"} purged`,
    )}`,
  );
}

export async function closeEngagementAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const engagementId = field(formData, "engagementId", 64);
  const [engagement] = await db
    .select()
    .from(engagements)
    .where(eq(engagements.id, engagementId))
    .limit(1);
  if (!engagement) redirectWithError("/admin", "Engagement not found.");
  if (!["DELIVERED", "REMEDIATION"].includes(engagement.status)) {
    redirectWithError(
      `/admin/engagements/${engagementId}`,
      "Only delivered or remediation engagements can be closed.",
    );
  }
  const now = new Date();
  await db
    .update(engagements)
    .set({ status: "CLOSED", updatedAt: now })
    .where(eq(engagements.id, engagementId));
  await writeAudit({
    actor: admin,
    action: "engagement.closed",
    orgId: engagement.orgId,
    engagementId,
  });
  revalidatePath(`/admin/engagements/${engagementId}`);
  redirect(
    `/admin/engagements/${engagementId}?notice=${encodeURIComponent("Engagement closed")}`,
  );
}
