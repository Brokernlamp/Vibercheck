import type { SessionUser } from "./auth";

export function isStaff(
  user: Pick<SessionUser, "role"> | null | undefined,
): boolean {
  return user?.role === "ANALYST" || user?.role === "ADMIN";
}

export function canViewEngagement(
  user: Pick<SessionUser, "role" | "orgId">,
  engagement: { orgId: string },
): boolean {
  if (isStaff(user)) return true;
  return Boolean(user.orgId) && user.orgId === engagement.orgId;
}

export function canAccessClientReport(
  user: Pick<SessionUser, "role" | "orgId">,
  engagement: { orgId: string },
  report: { status: string },
  termsAcceptedAt: Date | null,
): boolean {
  if (!canViewEngagement(user, engagement)) return false;
  if (isStaff(user)) return true;
  return report.status === "FINAL" && Boolean(termsAcceptedAt);
}
