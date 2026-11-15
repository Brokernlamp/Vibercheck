"use server";

import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  invites,
  organizations,
  passwordResetTokens,
  sessions,
  users,
} from "@/db/schema";
import {
  clearMfaChallenge,
  readMfaChallenge,
  setMfaChallenge,
} from "@/lib/auth-challenge";
import {
  createSession,
  destroySession,
  getCurrentUser,
  homeForRole,
  requireUser,
  revokeAllSessions,
  type UserRole,
} from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  randomToken,
} from "@/lib/crypto";
import { sendPasswordResetEmail } from "@/lib/email";
import { logger } from "@/lib/logger";
import { consumeRecoveryCode, generateTotpSecret, verifyTotp } from "@/lib/mfa";
import { checkPassword } from "@/lib/password-policy";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  checkRateLimit,
  clearRateLimit,
  consumeRateLimit,
} from "@/lib/rate-limit";
import { requestContext } from "@/lib/request-context";

export interface LoginState {
  error?: string;
}

export interface FormState {
  error?: string;
  success?: string;
  /** Set when an invitation was created but no email was sent (local preview). */
  invitePath?: string;
}

const INVALID_CREDENTIALS = "Invalid email or password.";
const DUMMY_HASH = `scrypt:${"0".repeat(32)}:${"0".repeat(128)}`;

function field(formData: FormData, name: string, max = 4000): string {
  return String(formData.get(name) ?? "").trim().slice(0, max);
}

function invalidEmail(email: string): boolean {
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254;
}

function retryMessage(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = field(formData, "email", 254).toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };
  if (invalidEmail(email)) return { error: INVALID_CREDENTIALS };

  const context = await requestContext();
  const emailKey = `login:email:${hashToken(email)}`;
  const ipKey = context.ipHash ? `login:ip:${context.ipHash}` : null;

  const emailLimit = await checkRateLimit(emailKey, 8, 15 * 60);
  if (!emailLimit.allowed) return { error: retryMessage(emailLimit.retryAfter) };
  if (ipKey) {
    const ipLimit = await checkRateLimit(ipKey, 30, 15 * 60);
    if (!ipLimit.allowed) return { error: retryMessage(ipLimit.retryAfter) };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  // Always perform a password derivation so a missing account is not
  // distinguishable from a wrong password by timing.
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.isActive || !valid) {
    await consumeRateLimit(emailKey, 8, 15 * 60);
    if (ipKey) await consumeRateLimit(ipKey, 30, 15 * 60).catch(() => undefined);
    await writeAudit({
      actorEmail: email,
      action: "auth.login_failed",
      detail: { reason: !user ? "unknown_account" : !user.isActive ? "inactive" : "bad_password" },
    });
    return { error: INVALID_CREDENTIALS };
  }

  await clearRateLimit(emailKey);

  if (user.mfaEnabledAt) {
    if (!user.mfaSecret) {
      logger.error("auth.mfa_missing_secret", { userId: user.id });
      return { error: "This account needs operator help to finish MFA setup." };
    }
    await setMfaChallenge(user.id);
    await writeAudit({
      actor: user,
      action: "auth.mfa_challenge",
      detail: { userId: user.id },
    });
    redirect("/login/mfa");
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await createSession(user.id);
  await writeAudit({
    actor: user,
    action: "auth.login",
    detail: { mfa: false, userAgent: context.userAgent },
  });
  redirect(homeForRole(user.role));
}

export async function verifyMfaAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const userId = await readMfaChallenge();
  if (!userId) redirect("/login");

  const code = field(formData, "code", 40);
  if (!code) return { error: "Enter the code from your authenticator." };

  const context = await requestContext();
  const userKey = `mfa:user:${userId}`;
  const ipKey = context.ipHash ? `mfa:ip:${context.ipHash}` : null;
  const userLimit = await checkRateLimit(userKey, 8, 10 * 60);
  if (!userLimit.allowed) return { error: retryMessage(userLimit.retryAfter) };
  if (ipKey) {
    const ipLimit = await checkRateLimit(ipKey, 30, 10 * 60);
    if (!ipLimit.allowed) return { error: retryMessage(ipLimit.retryAfter) };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user || !user.isActive || !user.mfaEnabledAt || !user.mfaSecret) {
    await clearMfaChallenge();
    redirect("/login");
  }

  let valid = false;
  let remainingCodes = user.mfaRecoveryCodes;
  let usedRecoveryCode = false;

  if (/^\d{6}$/.test(code.replace(/\s+/g, ""))) {
    try {
      valid = verifyTotp(decryptSecret(user.mfaSecret), code);
    } catch (error) {
      logger.error("auth.mfa_decrypt_failed", { userId: user.id, error });
    }
  } else {
    const result = consumeRecoveryCode(code, user.mfaRecoveryCodes);
    valid = result.valid;
    remainingCodes = result.remaining;
    usedRecoveryCode = result.valid;
  }

  if (!valid) {
    await consumeRateLimit(userKey, 8, 10 * 60);
    if (ipKey) await consumeRateLimit(ipKey, 30, 10 * 60).catch(() => undefined);
    await writeAudit({
      actor: user,
      action: "auth.mfa_failed",
      detail: { userId: user.id },
    });
    return { error: "That code is not valid. Try the next one." };
  }

  if (usedRecoveryCode) {
    await db
      .update(users)
      .set({ mfaRecoveryCodes: remainingCodes })
      .where(eq(users.id, user.id));
  }

  await clearRateLimit(userKey);
  await clearMfaChallenge();
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  await createSession(user.id);
  await writeAudit({
    actor: user,
    action: "auth.login",
    detail: {
      mfa: true,
      recoveryCode: usedRecoveryCode,
      remainingRecoveryCodes: usedRecoveryCode ? remainingCodes.length : undefined,
      userAgent: context.userAgent,
    },
  });
  redirect(homeForRole(user.role));
}

export async function logoutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await writeAudit({
      actor: user,
      action: "auth.logout",
      detail: { sessionId: user.sessionId.slice(0, 12) },
    });
  }
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = field(formData, "email", 254).toLowerCase();
  if (invalidEmail(email)) {
    return { error: "Enter a valid work email." };
  }

  const context = await requestContext();
  const emailKey = `reset:email:${hashToken(email)}`;
  const ipKey = context.ipHash ? `reset:ip:${context.ipHash}` : null;
  const emailLimit = await checkRateLimit(emailKey, 3, 60 * 60);
  const ipLimit = ipKey ? await checkRateLimit(ipKey, 20, 60 * 60) : null;

  // Always show the same outcome. Do not reveal whether the account exists or
  // whether the limiter suppressed a message.
  if (!emailLimit.allowed || (ipLimit && !ipLimit.allowed)) {
    return { success: "If an account exists for that email, a reset link is on its way." };
  }

  await consumeRateLimit(emailKey, 3, 60 * 60);
  if (ipKey) await consumeRateLimit(ipKey, 20, 60 * 60).catch(() => undefined);

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.isActive, true)))
    .limit(1);

  if (user) {
    const token = randomToken(32);
    await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      requestedIpHash: context.ipHash,
    });
    try {
      await sendPasswordResetEmail({ to: user.email, name: user.name, token });
    } catch (error) {
      logger.error("auth.reset_email_failed", { userId: user.id, error });
    }
  }

  await writeAudit({
    actorEmail: email,
    action: "auth.password_reset_requested",
    detail: { accountFound: Boolean(user) },
  });

  return { success: "If an account exists for that email, a reset link is on its way." };
}

export async function resetPasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = field(formData, "token", 200);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!token) return { error: "This reset link is invalid or has expired." };
  if (password !== confirm) return { error: "The passwords do not match." };

  const [row] = await db
    .select({ token: passwordResetTokens, user: users })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!row) return { error: "This reset link is invalid or has expired." };

  const policy = checkPassword(password, {
    email: row.user.email,
    name: row.user.name,
  });
  if (!policy.ok) return { error: policy.error };

  const now = new Date();
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, emailVerifiedAt: row.user.emailVerifiedAt ?? now })
      .where(eq(users.id, row.user.id));
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(eq(passwordResetTokens.id, row.token.id));
    await tx
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, row.user.id),
          isNull(passwordResetTokens.usedAt),
          ne(passwordResetTokens.id, row.token.id),
        ),
      );
  });
  await revokeAllSessions(row.user.id);
  await writeAudit({
    actor: row.user,
    action: "auth.password_reset",
    detail: { userId: row.user.id },
  });

  return { success: "Password updated. You can sign in with the new password." };
}

export async function acceptInviteAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = field(formData, "token", 200);
  const name = field(formData, "name", 120);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!token) return { error: "This invitation is invalid or has expired." };
  if (name.length < 2) return { error: "Enter your full name." };
  if (password !== confirm) return { error: "The passwords do not match." };

  const context = await requestContext();
  const ipKey = context.ipHash ? `invite:ip:${context.ipHash}` : null;
  if (ipKey) {
    const limit = await checkRateLimit(ipKey, 20, 60 * 60);
    if (!limit.allowed) return { error: retryMessage(limit.retryAfter) };
    await consumeRateLimit(ipKey, 20, 60 * 60).catch(() => undefined);
  }

  const [row] = await db
    .select({ invite: invites, organization: organizations })
    .from(invites)
    .leftJoin(organizations, eq(organizations.id, invites.orgId))
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.acceptedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return { error: "This invitation is invalid or has expired." };
  if (
    row.invite.role !== "CLIENT" &&
    row.invite.role !== "DEVELOPER" &&
    row.invite.role !== "ANALYST"
  ) {
    return { error: "This invitation cannot be accepted." };
  }
  if (
    (row.invite.role === "CLIENT" || row.invite.role === "DEVELOPER") &&
    !row.invite.orgId
  ) {
    return { error: "This invitation is missing its organization. Contact your operator." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, row.invite.email))
    .limit(1);
  if (existing) {
    return { error: "An account already exists for this email. Sign in or reset your password." };
  }

  const policy = checkPassword(password, {
    email: row.invite.email,
    name,
  });
  if (!policy.ok) return { error: policy.error };

  const now = new Date();
  const passwordHash = await hashPassword(password);
  let userId = "";
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        email: row.invite.email,
        name,
        passwordHash,
        role: row.invite.role,
        orgId:
          row.invite.role === "CLIENT" || row.invite.role === "DEVELOPER"
            ? row.invite.orgId
            : null,
        emailVerifiedAt: now,
        lastLoginAt: now,
      })
      .returning({ id: users.id });
    userId = created.id;
    await tx
      .update(invites)
      .set({ acceptedAt: now })
      .where(eq(invites.id, row.invite.id));
    await tx
      .update(invites)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invites.email, row.invite.email),
          isNull(invites.acceptedAt),
          ne(invites.id, row.invite.id),
        ),
      );
  });

  await createSession(userId);
  await writeAudit({
    actor: {
      id: userId,
      email: row.invite.email,
      role: row.invite.role as UserRole,
    },
    action: "user.invite_accepted",
    orgId: row.invite.orgId,
    detail: {
      inviteId: row.invite.id,
      role: row.invite.role,
      organization: row.organization?.name ?? null,
    },
  });
  redirect(homeForRole(row.invite.role as UserRole));
}

export async function changePasswordAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password !== confirm) return { error: "The new passwords do not match." };

  const [record] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
    return { error: "Your current password is not correct." };
  }

  const policy = checkPassword(password, { email: user.email, name: user.name });
  if (!policy.ok) return { error: policy.error };
  if (await verifyPassword(password, record.passwordHash)) {
    return { error: "Choose a password different from the current one." };
  }

  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await revokeAllSessions(user.id, user.sessionId);
  await writeAudit({
    actor: user,
    action: "auth.password_changed",
    detail: { userId: user.id, otherSessionsRevoked: true },
  });
  return { success: "Password changed. Other sessions were signed out." };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const sessionId = field(formData, "sessionId", 128);
  if (!sessionId) redirect("/account/security");
  if (sessionId === user.sessionId) {
    await destroySession();
    redirect("/login");
  }
  await revokeSessionForUser(sessionId, user.id);
  await writeAudit({
    actor: user,
    action: "auth.session_revoked",
    detail: { sessionId: sessionId.slice(0, 12) },
  });
  redirect("/account/security?notice=Session+revoked");
}

async function revokeSessionForUser(sessionId: string, userId: string) {
  await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

export async function revokeAllSessionsAction(): Promise<void> {
  const user = await requireUser();
  await revokeAllSessions(user.id, user.sessionId);
  await writeAudit({
    actor: user,
    action: "auth.sessions_revoked_all",
    detail: { keptCurrent: true },
  });
  redirect("/account/security?notice=Other+sessions+revoked");
}

export async function beginMfaSetupAction(): Promise<void> {
  const user = await requireUser();
  const [record] = await db
    .select({ mfaEnabledAt: users.mfaEnabledAt, mfaSecret: users.mfaSecret })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (record?.mfaEnabledAt) redirect("/account/security");
  if (!record?.mfaSecret) {
    const secret = generateTotpSecret();
    await db
      .update(users)
      .set({ mfaSecret: encryptSecret(secret) })
      .where(eq(users.id, user.id));
  }
  redirect("/account/security/mfa");
}

export async function enableMfaAction(
  _previousState: FormState & { recoveryCodes?: string[] },
  formData: FormData,
): Promise<FormState & { recoveryCodes?: string[] }> {
  const user = await requireUser();
  const code = field(formData, "code", 20);
  const [record] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!record?.mfaSecret) return { error: "Start the setup again." };
  if (record.mfaEnabledAt) return { error: "MFA is already enabled." };

  let valid = false;
  try {
    valid = verifyTotp(decryptSecret(record.mfaSecret), code);
  } catch {
    valid = false;
  }
  if (!valid) return { error: "That code is not valid. Check your device clock and try again." };

  const { generateRecoveryCodes } = await import("@/lib/mfa");
  const recovery = generateRecoveryCodes();
  await db
    .update(users)
    .set({
      mfaEnabledAt: new Date(),
      mfaRecoveryCodes: recovery.hashes,
    })
    .where(eq(users.id, user.id));
  await writeAudit({
    actor: user,
    action: "auth.mfa_enabled",
    detail: { userId: user.id, recoveryCodeCount: recovery.hashes.length },
  });
  return {
    success: "Two-factor authentication is on. Store the recovery codes now.",
    recoveryCodes: recovery.plain,
  };
}

export async function disableMfaAction(
  _previousState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const code = field(formData, "code", 20);
  const [record] = await db
    .select({
      passwordHash: users.passwordHash,
      mfaSecret: users.mfaSecret,
      mfaEnabledAt: users.mfaEnabledAt,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!record || !record.mfaEnabledAt) return { error: "MFA is not enabled." };
  if (!(await verifyPassword(password, record.passwordHash))) {
    return { error: "Your password is not correct." };
  }
  if (!record.mfaSecret) return { error: "MFA state is invalid. Contact an operator." };
  let valid = false;
  try {
    valid = verifyTotp(decryptSecret(record.mfaSecret), code);
  } catch {
    valid = false;
  }
  if (!valid) return { error: "That authenticator code is not valid." };

  await db
    .update(users)
    .set({ mfaSecret: null, mfaEnabledAt: null, mfaRecoveryCodes: [] })
    .where(eq(users.id, user.id));
  await writeAudit({
    actor: user,
    action: "auth.mfa_disabled",
    detail: { userId: user.id },
  });
  return { success: "Two-factor authentication is off." };
}

export async function regenerateRecoveryCodesAction(
  _previousState: FormState & { recoveryCodes?: string[] },
  formData: FormData,
): Promise<FormState & { recoveryCodes?: string[] }> {
  const user = await requireUser();
  const password = String(formData.get("password") ?? "");
  const [record] = await db
    .select({ passwordHash: users.passwordHash, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (!record?.mfaEnabledAt) return { error: "Enable MFA first." };
  if (!(await verifyPassword(password, record.passwordHash))) {
    return { error: "Your password is not correct." };
  }
  const { generateRecoveryCodes } = await import("@/lib/mfa");
  const recovery = generateRecoveryCodes();
  await db
    .update(users)
    .set({ mfaRecoveryCodes: recovery.hashes })
    .where(eq(users.id, user.id));
  await writeAudit({
    actor: user,
    action: "auth.mfa_recovery_regenerated",
    detail: { userId: user.id, count: recovery.hashes.length },
  });
  return {
    success: "New recovery codes generated. Old codes no longer work.",
    recoveryCodes: recovery.plain,
  };
}
