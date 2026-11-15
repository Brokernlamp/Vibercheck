"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { invites, organizations, sessions, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { hashToken, randomToken } from "@/lib/crypto";
import { sendInviteEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { redirectWithError } from "@/lib/navigation";
import type { FormState } from "./auth";

function field(formData: FormData, name: string, max = 400): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function invalidEmail(email: string): boolean {
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254;
}

const INVITE_DAYS = 7;

export async function createOrganizationAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const name = field(formData, "name", 120);
  const slug = field(formData, "slug", 60).toLowerCase();
  const back = "/admin/clients";

  if (name.length < 2) redirectWithError(back, "Enter an organization name.");
  if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
    redirectWithError(
      back,
      "Use a lowercase slug with letters, numbers, and hyphens (3–60 characters).",
    );
  }
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (existing) redirectWithError(back, "That slug is already in use.");

  const [organization] = await db
    .insert(organizations)
    .values({ name, slug, plan: "NONE" })
    .returning();
  await writeAudit({
    actor: admin,
    action: "organization.created",
    orgId: organization.id,
    detail: { name, slug },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent(`Created ${name}`)}`);
}

export async function inviteUserAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const admin = await requireAdmin();
  const email = field(formData, "email", 254).toLowerCase();
  const name = field(formData, "name", 120);
  const role = field(formData, "role", 20);
  const orgId = field(formData, "orgId", 64);

  if (invalidEmail(email)) return { error: "Enter a valid work email." };
  if (name.length < 2) return { error: "Enter the person's full name." };
  if (role !== "CLIENT" && role !== "DEVELOPER" && role !== "ANALYST") {
    return { error: "Choose freelancer or analyst." };
  }

  let organizationName: string | null = null;
  if (role === "CLIENT" || role === "DEVELOPER") {
    if (!orgId) return { error: "Choose the freelancer workspace." };
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (!organization) return { error: "That organization does not exist." };
    organizationName = organization.name;
  }

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingUser) return { error: "A user with that email already exists." };

  const [existingInvite] = await db
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.email, email),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
      ),
    )
    .limit(1);
  if (existingInvite) {
    return { error: "An active invitation already exists for that email. Resend it below." };
  }

  const token = randomToken(32);
  const [invite] = await db
    .insert(invites)
    .values({
      email,
      name,
      role,
      orgId: role === "CLIENT" || role === "DEVELOPER" ? orgId : null,
      tokenHash: hashToken(token),
      invitedById: admin.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    })
    .returning({ id: invites.id });

  let emailed = true;
  let preview = false;
  let invitePath: string | undefined;
  const inviteLink = `/accept-invite?token=${encodeURIComponent(token)}`;
  try {
    const delivery = await sendInviteEmail({
      to: email,
      name,
      inviterName: admin.name,
      role,
      organizationName,
      token,
    });
    // Local development writes the message to a private outbox instead of
    // sending it. Hand the admin the link so a tester can still accept.
    if (delivery.preview) {
      preview = true;
      invitePath = inviteLink;
    }
  } catch (error) {
    emailed = false;
    invitePath = inviteLink;
    logger.error("invite.email_failed", { inviteId: invite.id, error });
  }

  await writeAudit({
    actor: admin,
    action: "user.invited",
    orgId: role === "CLIENT" || role === "DEVELOPER" ? orgId : null,
    detail: { inviteId: invite.id, email, role, emailed },
  });
  revalidatePath("/admin/clients");

  return {
    success: preview
      ? `Invitation created for ${email}. Outbound email is off in this environment, so send them the link below.`
      : emailed
        ? `Invitation sent to ${email}.`
        : `Invitation created for ${email}, but email delivery failed. Send them the link below instead.`,
    invitePath,
  };
}

export async function resendInviteAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const inviteId = field(formData, "inviteId", 64);
  const back = "/admin/clients";

  const [row] = await db
    .select({ invite: invites, organization: organizations })
    .from(invites)
    .leftJoin(organizations, eq(organizations.id, invites.orgId))
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!row || row.invite.acceptedAt || row.invite.revokedAt) {
    redirectWithError(back, "That invitation is no longer active.");
  }
  if (
    row.invite.role !== "CLIENT" &&
    row.invite.role !== "DEVELOPER" &&
    row.invite.role !== "ANALYST"
  ) {
    redirectWithError(back, "That invitation cannot be resent.");
  }

  const token = randomToken(32);
  await db
    .update(invites)
    .set({
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    })
    .where(eq(invites.id, inviteId));

  try {
    await sendInviteEmail({
      to: row.invite.email,
      name: row.invite.name,
      inviterName: admin.name,
      role: row.invite.role,
      organizationName: row.organization?.name ?? null,
      token,
    });
  } catch (error) {
    logger.error("invite.resend_failed", { inviteId, error });
    redirectWithError(back, "The invitation was refreshed but email delivery failed.");
  }

  await writeAudit({
    actor: admin,
    action: "user.invite_resent",
    orgId: row.invite.orgId,
    detail: { inviteId, email: row.invite.email, role: row.invite.role },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Invitation resent")}`);
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const inviteId = field(formData, "inviteId", 64);
  const back = "/admin/clients";

  const [invite] = await db
    .select()
    .from(invites)
    .where(eq(invites.id, inviteId))
    .limit(1);
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    redirectWithError(back, "That invitation is no longer active.");
  }

  await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(eq(invites.id, inviteId));
  await writeAudit({
    actor: admin,
    action: "user.invite_revoked",
    orgId: invite.orgId,
    detail: { inviteId, email: invite.email },
  });
  revalidatePath(back);
  redirect(`${back}?notice=${encodeURIComponent("Invitation revoked")}`);
}

export async function setUserActiveAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = field(formData, "userId", 64);
  const active = field(formData, "active", 10) === "1";
  const back = "/admin/clients";

  if (userId === admin.id) {
    redirectWithError(back, "You cannot deactivate your own account.");
  }
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) redirectWithError(back, "User not found.");

  if (!active && target.role === "ADMIN") {
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.role, "ADMIN"),
          eq(users.isActive, true),
          ne(users.id, userId),
        ),
      );
    if (otherAdmins.length === 0) {
      redirectWithError(back, "Keep at least one active operator account.");
    }
  }

  await db.update(users).set({ isActive: active }).where(eq(users.id, userId));
  if (!active) {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }
  await writeAudit({
    actor: admin,
    action: active ? "user.reactivated" : "user.deactivated",
    orgId: target.orgId,
    detail: { userId, email: target.email, role: target.role },
  });
  revalidatePath(back);
  redirect(
    `${back}?notice=${encodeURIComponent(
      active ? "User reactivated" : "User deactivated and signed out",
    )}`,
  );
}
