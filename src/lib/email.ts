import { promises as fs } from "node:fs";
import path from "node:path";
import { appUrl, dataDir, isProduction, mailFrom, resendApiKey } from "./env";
import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag?: string;
}

export interface MailResult {
  id: string | null;
  preview: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout({
  heading,
  body,
  action,
  actionUrl,
  footer,
}: {
  heading: string;
  body: string;
  action?: string;
  actionUrl?: string;
  footer?: string;
}): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:32px 16px;background:#f3f1ea;color:#17201a;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #d9d7cd;border-radius:12px;overflow:hidden">
      <div style="padding:18px 24px;background:#17251d;color:#e8eadf;font-weight:700;letter-spacing:-0.02em">VibeCheck</div>
      <div style="padding:28px 24px 8px">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.2;letter-spacing:-0.03em">${escapeHtml(heading)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.65;color:#4b554e">${body}</p>
      </div>
      ${
        action && actionUrl
          ? `<div style="padding:22px 24px 6px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#17251d;color:#f6f7ef;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">${escapeHtml(action)}</a></div>
             <p style="margin:14px 24px 0;font-size:11px;line-height:1.5;color:#7a827b;word-break:break-all">${escapeHtml(actionUrl)}</p>`
          : ""
      }
      <div style="padding:22px 24px 26px;margin-top:18px;border-top:1px solid #ece9df;font-size:11px;line-height:1.6;color:#7a827b">
        ${footer ? escapeHtml(footer) : "This message was sent by VibeCheck about your account."}
      </div>
    </div>
  </body>
</html>`;
}

async function sendWithResend(message: MailMessage, apiKey: string): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`Email provider rejected the message (${response.status}): ${detail}`);
  }
  const payload = (await response.json().catch(() => null)) as { id?: string } | null;
  return payload?.id ?? null;
}

export async function sendEmail(message: MailMessage): Promise<MailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    if (isProduction()) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    logger.info("email.preview", {
      to: message.to,
      subject: message.subject,
      text: message.text,
      tag: message.tag,
    });
    // A private local outbox makes invitation and reset flows testable without
    // a provider. It lives under the ignored data directory and is never
    // written in production.
    const outboxDir = path.join(dataDir(), "mail");
    await fs.mkdir(outboxDir, { recursive: true, mode: 0o700 });
    await fs.appendFile(
      path.join(outboxDir, "outbox.jsonl"),
      `${JSON.stringify({
        at: new Date().toISOString(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        tag: message.tag ?? null,
      })}\n`,
      { mode: 0o600 },
    );
    return { id: null, preview: true };
  }

  try {
    const id = await sendWithResend(message, apiKey);
    logger.info("email.sent", { to: message.to, subject: message.subject, tag: message.tag, id });
    return { id, preview: false };
  } catch (error) {
    logger.error("email.failed", {
      to: message.to,
      subject: message.subject,
      tag: message.tag,
      error,
    });
    throw error;
  }
}

export async function sendInviteEmail({
  to,
  name,
  inviterName,
  role,
  organizationName,
  token,
}: {
  to: string;
  name: string;
  inviterName: string;
  role: "CLIENT" | "DEVELOPER" | "ANALYST" | "ADMIN";
  organizationName?: string | null;
  token: string;
}): Promise<MailResult> {
  const url = `${appUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
  const roleLabel =
    role === "CLIENT"
      ? "client"
      : role === "DEVELOPER"
        ? "freelancer"
        : "security analyst";
  const context = organizationName ? ` for ${organizationName}` : "";
  const html = layout({
    heading: `You're invited to VibeCheck`,
    body: `${escapeHtml(inviterName)} invited you to join VibeCheck as a ${escapeHtml(
      roleLabel,
    )}${escapeHtml(context)}. Set your password to activate the account. The link expires in 7 days.`,
    action: "Set your password",
    actionUrl: url,
    footer: "If you were not expecting this invitation, you can ignore the email.",
  });
  return sendEmail({
    to,
    subject: `VibeCheck invitation${organizationName ? ` — ${organizationName}` : ""}`,
    html,
    text: `${inviterName} invited you to VibeCheck as a ${roleLabel}${context}.\n\nSet your password (expires in 7 days): ${url}\n\nIf you were not expecting this, ignore the email.`,
    tag: "invite",
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  token,
}: {
  to: string;
  name: string;
  token: string;
}): Promise<MailResult> {
  const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const html = layout({
    heading: "Reset your password",
    body: `Hi ${escapeHtml(
      name.split(/\s+/)[0] || "there",
    )}, use the link below to choose a new password. It expires in one hour and can be used once. If you did not request this, no action is needed.`,
    action: "Choose a new password",
    actionUrl: url,
    footer: "For security, this link cannot be reused. Reset links invalidate on use.",
  });
  return sendEmail({
    to,
    subject: "Reset your VibeCheck password",
    html,
    text: `Choose a new VibeCheck password (expires in one hour): ${url}`,
    tag: "password-reset",
  });
}

export async function sendReportReadyEmail({
  to,
  name,
  engagementName,
  reportUrl,
}: {
  to: string;
  name: string;
  engagementName: string;
  reportUrl: string;
}): Promise<MailResult> {
  const url = `${appUrl()}${reportUrl}`;
  const html = layout({
    heading: "Your audit report is ready",
    body: `${escapeHtml(
      name.split(/\s+/)[0] || "there",
    )}, the analyst-reviewed report for ${escapeHtml(
      engagementName,
    )} is finalized. Accept the service terms to open it and track remediation.`,
    action: "Open the report",
    actionUrl: url,
    footer: "This link requires you to sign in to the VibeCheck client portal.",
  });
  return sendEmail({
    to,
    subject: `Report ready — ${engagementName}`,
    html,
    text: `The report for ${engagementName} is ready: ${url}`,
    tag: "report-ready",
  });
}
