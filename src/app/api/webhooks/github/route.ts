import { and, desc, eq, lt, ne, or } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { engagements, githubWebhookDeliveries } from "@/db/schema";
import { scanExecution } from "@/lib/env";
import {
  assertSourceDirectory,
  cloneRepository,
  githubRepositoryKey,
  newSourceDirectory,
  purgeSource,
  validateRepositoryUrl,
} from "@/lib/ingest";
import {
  installationTokenForRepository,
  verifyGitHubWebhook,
} from "@/lib/github-app";
import { logger } from "@/lib/logger";
import { createScanRun, runScan } from "@/lib/scan-service";

const MAX_WEBHOOK_BYTES = 1_000_000;

interface PushEvent {
  after: string;
  deleted: boolean;
  repository: { html_url: string };
  installation: { id: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPushEvent(value: unknown): PushEvent | null {
  if (!isRecord(value) || !isRecord(value.repository) || !isRecord(value.installation)) {
    return null;
  }
  const after = value.after;
  const deleted = value.deleted;
  const htmlUrl = value.repository.html_url;
  const installationId = value.installation.id;
  if (
    typeof after !== "string" ||
    !/^[a-f0-9]{40}$/i.test(after) ||
    typeof deleted !== "boolean" ||
    typeof htmlUrl !== "string" ||
    typeof installationId !== "number" ||
    !Number.isSafeInteger(installationId) ||
    installationId <= 0
  ) {
    return null;
  }
  return {
    after,
    deleted,
    repository: { html_url: htmlUrl },
    installation: { id: installationId },
  };
}

export async function POST(request: Request): Promise<Response> {
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook payload is too large." }, { status: 413 });
  }

  try {
    if (!verifyGitHubWebhook(rawBody, request.headers.get("x-hub-signature-256"))) {
      return Response.json({ error: "Invalid webhook signature." }, { status: 401 });
    }
  } catch (error) {
    logger.error("github_webhook_configuration_error", { error });
    return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  }

  if (request.headers.get("x-github-event") !== "push") {
    return Response.json({ accepted: true, ignored: "unsupported_event" });
  }

  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId || !/^[a-f0-9-]{36}$/i.test(deliveryId)) {
    return Response.json({ error: "Invalid GitHub delivery identifier." }, { status: 400 });
  }

  let event: PushEvent | null;
  try {
    event = readPushEvent(JSON.parse(rawBody));
  } catch {
    event = null;
  }
  if (!event) {
    return Response.json({ error: "Invalid push event payload." }, { status: 400 });
  }
  if (event.deleted || /^0{40}$/.test(event.after)) {
    return Response.json({ accepted: true, ignored: "branch_deleted" });
  }

  const repositoryUrl = validateRepositoryUrl(event.repository.html_url);
  const repoKey = githubRepositoryKey(repositoryUrl);
  if (!repositoryUrl || !repoKey) {
    return Response.json({ error: "Unsupported GitHub repository URL." }, { status: 400 });
  }
  const [owner, repo] = repoKey.split("/");
  if (!owner || !repo) {
    return Response.json({ error: "Invalid GitHub repository." }, { status: 400 });
  }

  await db
    .delete(githubWebhookDeliveries)
    .where(
      lt(
        githubWebhookDeliveries.createdAt,
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      ),
    );

  const [delivery] = await db
    .insert(githubWebhookDeliveries)
    .values({ id: deliveryId })
    .onConflictDoNothing()
    .returning({ id: githubWebhookDeliveries.id });
  if (!delivery) {
    const [retried] = await db
      .update(githubWebhookDeliveries)
      .set({ status: "PROCESSING", createdAt: new Date() })
      .where(
        and(
          eq(githubWebhookDeliveries.id, deliveryId),
          or(
            eq(githubWebhookDeliveries.status, "FAILED"),
            and(
              eq(githubWebhookDeliveries.status, "PROCESSING"),
              lt(
                githubWebhookDeliveries.createdAt,
                new Date(Date.now() - 5 * 60 * 1000),
              ),
            ),
          ),
        ),
      )
      .returning({ id: githubWebhookDeliveries.id });
    if (!retried) {
      return Response.json({ accepted: true, duplicate: true });
    }
  }

  after(async () => {
    let engagementId: string | undefined;
    let sourcePath: string | null = null;
    try {
      const linkedEngagements = await db
        .select()
        .from(engagements)
        .where(
          and(
            eq(engagements.sourceType, "GITHUB"),
            ne(engagements.status, "CLOSED"),
          ),
        )
        .orderBy(desc(engagements.createdAt));
      const matches = linkedEngagements.filter(
        (engagement) =>
          githubRepositoryKey(engagement.repoUrl) === repoKey &&
          engagement.githubInstallationId === String(event.installation.id),
      );
      if (matches.length === 0) {
        await db
          .update(githubWebhookDeliveries)
          .set({ status: "IGNORED" })
          .where(eq(githubWebhookDeliveries.id, deliveryId));
        return;
      }
      if (matches.length > 1) {
        logger.warn("github_webhook_multiple_engagements", {
          repo: repoKey,
          engagementIds: matches.map((engagement) => engagement.id),
        });
        await db
          .update(githubWebhookDeliveries)
          .set({ status: "AMBIGUOUS" })
          .where(eq(githubWebhookDeliveries.id, deliveryId));
        return;
      }
      const engagement = matches[0]!;
      engagementId = engagement.id;
      const { token, installationId } = await installationTokenForRepository(
        owner,
        repo,
        String(event.installation.id),
      );
      sourcePath = await newSourceDirectory(engagement.id, deliveryId);
      await cloneRepository(repositoryUrl, sourcePath, {
        githubToken: token,
        ref: event.after,
      });
      await assertSourceDirectory(sourcePath);
      const scan = await createScanRun({
        engagementId: engagement.id,
        kind: "CI",
        sourcePath,
        allowConcurrentQueue: true,
        github: {
          owner,
          repo,
          installationId,
          commitSha: event.after,
        },
      });
      await db
        .update(githubWebhookDeliveries)
        .set({ status: "QUEUED" })
        .where(eq(githubWebhookDeliveries.id, deliveryId));
      if (scanExecution() === "inline") {
        void runScan(scan.id).catch((error) => {
          logger.error("github_webhook_scan_failed", {
            scanId: scan.id,
            engagementId: engagement.id,
            error,
          });
        });
      }
    } catch (error) {
      if (sourcePath) await purgeSource(sourcePath).catch((cleanupError) => {
        logger.warn("github_webhook_source_cleanup_failed", {
          deliveryId,
          cleanupError,
        });
      });
      await db
        .update(githubWebhookDeliveries)
        .set({ status: "FAILED" })
        .where(eq(githubWebhookDeliveries.id, deliveryId));
      logger.error("github_webhook_processing_failed", {
        deliveryId,
        repo: repoKey,
        engagementId,
        error,
      });
    }
  });

  return Response.json({ accepted: true, queued: true }, { status: 202 });
}
