import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { engagements, organizations, reports, scanRuns } from "@/db/schema";
import { ReportView } from "@/components/report-view";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/domain";
import { openAccess, soloMode } from "@/lib/env";
import { buildReportPayload, type ReportPayload } from "@/lib/report";
import { getFindingsForScan } from "@/lib/queries";

export const metadata: Metadata = { title: "Security audit report" };
export const dynamic = "force-dynamic";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const [row] = await db
    .select({
      report: reports,
      engagement: engagements,
      organization: organizations,
    })
    .from(reports)
    .innerJoin(engagements, eq(engagements.id, reports.engagementId))
    .innerJoin(organizations, eq(organizations.id, engagements.orgId))
    .where(eq(reports.id, id))
    .limit(1);

  if (!row) notFound();
  const { report, engagement, organization } = row;
  const isClient =
    openAccess() || user.role === "CLIENT" || user.role === "DEVELOPER";

  if (isClient) {
    if (engagement.orgId !== user.orgId) notFound();
    if (report.status !== "FINAL") notFound();
    if (!engagement.termsAcceptedAt && !soloMode()) {
      redirect(`/portal/audits/${engagement.id}`);
    }
  }

  if (report.status !== "FINAL") {
    redirect(
      `/analyst/engagements/${engagement.id}?notice=${encodeURIComponent(
        "The report is still a draft. Finalize it after analyst sign-off.",
      )}`,
    );
  }

  let payload = report.payload as ReportPayload | null;
  if (!payload) {
    // Defensive fallback: rebuild from confirmed findings only, never raw drafts.
    const [scanData] = await db
      .select()
      .from(scanRuns)
      .where(eq(scanRuns.id, report.scanId))
      .limit(1);
    if (!scanData) notFound();
    const findings = await getFindingsForScan(report.scanId);
    payload = buildReportPayload({
      engagement,
      organization,
      scan: scanData,
      findings,
      version: report.version,
      executiveSummary: report.executiveSummary,
      analystNote: engagement.reviewNote,
      reviewMode: soloMode() ? "self-service" : "analyst",
    });
  }

  return (
    <ReportView
      payload={payload}
      backHref={
        isClient
          ? `/portal/audits/${engagement.id}`
          : `/analyst/engagements/${engagement.id}`
      }
      backLabel={
        isClient ? (soloMode() ? "Back to project" : "Back to engagement") : "Back to review"
      }
      clientView={isClient}
    />
  );
}
