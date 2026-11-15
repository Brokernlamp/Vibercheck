import "server-only";
import { and, eq, gt, lt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { organizations, sessions, users } from "@/db/schema";
import { hashToken, randomToken } from "./crypto";
import { isProduction, openAccess, requireStaffMfa, soloMode } from "./env";
import { requestContext } from "./request-context";

const SESSION_DAYS = 7;
const TOUCH_INTERVAL_MS = 10 * 60 * 1000;

export type UserRole = "ADMIN" | "ANALYST" | "CLIENT" | "DEVELOPER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  sessionId: string;
  mfaEnabled: boolean;
}

export function sessionCookieName(): string {
  return isProduction() ? "__Host-vibecheck_session" : "vibecheck_session";
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction(),
    expires: expiresAt,
    path: "/",
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  );
  const context = await requestContext();
  await db.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: context.userAgent,
    ipHash: context.ipHash,
    lastSeenAt: new Date(),
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, sessionCookieOptions(expiresAt));
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
  }
  jar.delete(sessionCookieName());
}

export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token ? hashToken(token) : null;
}

export async function revokeSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  const jar = await cookies();
  if (jar.get(sessionCookieName())?.value) {
    const current = hashToken(jar.get(sessionCookieName())!.value);
    if (current === sessionId) jar.delete(sessionCookieName());
  }
}

export async function revokeAllSessions(
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  const condition = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  await db.delete(sessions).where(condition);
}

/**
 * First run on an empty database: create the local operator + tenant so the
 * product is usable without any sign-in. Conflicts are ignored so concurrent
 * first requests converge on the same rows.
 */
async function bootstrapOpenAccess(): Promise<void> {
  const slug = "local";
  const email = "operator@local.test";
  await db
    .insert(organizations)
    .values({ name: "Local workspace", slug })
    .onConflictDoNothing({ target: organizations.slug });
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  await db
    .insert(users)
    .values({
      email,
      name: "Local operator",
      // Never verified: open access bypasses credentials entirely.
      passwordHash: hashToken(randomToken(32)),
      role: "ADMIN",
      orgId: org?.id ?? null,
    })
    .onConflictDoNothing({ target: users.email });
}

/**
 * Open-access identity: one privileged operator bound to the first tenant, so
 * every area of the product (portal, analyst desk, operations) renders without
 * credentials. Bootstraps a local operator when the database has no users.
 */
async function openAccessUser(): Promise<SessionUser | null> {
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.role, users.email)
    .limit(1);
  if (!user) {
    await bootstrapOpenAccess();
    [user] = await db
      .select()
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(users.role, users.email)
      .limit(1);
    if (!user) return null;
  }
  const [org] = await db
    .select()
    .from(organizations)
    .orderBy(organizations.name)
    .limit(1);
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    orgId: org?.id ?? null,
    orgName: org?.name ?? null,
    orgSlug: org?.slug ?? null,
    sessionId: "open-access",
    mfaEnabled: true,
  };
}

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (openAccess()) return openAccessUser();

  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const sessionId = hashToken(token);

  const [row] = await db
    .select({
      session: sessions,
      user: users,
      org: organizations,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(organizations, eq(organizations.id, users.orgId))
    .where(
      and(
        eq(sessions.id, sessionId),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return null;

  if (Date.now() - row.session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .catch(() => undefined);
  }

  return {
    id: row.user.id,
    email: row.user.email,
    name: row.user.name,
    role: row.user.role,
    orgId: row.user.orgId,
    orgName: row.org?.name ?? null,
    orgSlug: row.org?.slug ?? null,
    sessionId,
    mfaEnabled: Boolean(row.user.mfaEnabledAt),
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(openAccess() ? "/" : "/login");
  return user;
}

export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (openAccess()) return user;
  if (user.role !== "ANALYST" && user.role !== "ADMIN") {
    redirect("/portal");
  }
  if (requireStaffMfa() && !user.mfaEnabled) {
    redirect("/account/security/mfa");
  }
  return user;
}

export async function requireAnalyst(): Promise<SessionUser> {
  return requireStaff();
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (openAccess()) return user;
  if (user.role !== "ADMIN") {
    redirect(user.role === "ANALYST" ? "/analyst" : "/portal");
  }
  if (requireStaffMfa() && !user.mfaEnabled) {
    redirect("/account/security/mfa");
  }
  return user;
}

export async function requireClient(): Promise<SessionUser> {
  const user = await requireUser();
  if (openAccess()) return user;
  if (user.role !== "CLIENT" && user.role !== "DEVELOPER") {
    redirect(user.role === "ANALYST" ? "/analyst" : "/admin");
  }
  return user;
}

export async function requireDeveloper(): Promise<SessionUser> {
  return requireClient();
}

export function homeForRole(role: UserRole): string {
  if (soloMode() && (role === "CLIENT" || role === "DEVELOPER" || openAccess())) {
    return "/portal";
  }
  if (role === "ADMIN") return "/admin";
  if (role === "ANALYST") return "/analyst";
  return "/portal";
}

/** Housekeeping used by the worker and admin tooling. */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
