import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

const API_BASE = "https://api.github.com";
const APP_JWT_TTL_SECONDS = 8 * 60;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function appCredentials(): { appId: string; privateKey: string } {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!appId || !/^\d+$/.test(appId) || !privateKey) {
    throw new Error("GitHub App credentials are not configured.");
  }
  return { appId, privateKey };
}

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
  );
}

function appJwt(): string {
  const { appId, privateKey } = appCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iat: now - 30,
      exp: now + APP_JWT_TTL_SECONDS,
      iss: appId,
    }),
  );
  const message = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return `${message}.${signer.sign(privateKey, "base64url")}`;
}

async function githubRequest<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    logger.warn("github_api_request_failed", {
      path,
      status: response.status,
    });
    throw new Error(`GitHub API request failed with status ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function installationTokenForRepository(
  owner: string,
  repo: string,
  installationId?: string,
): Promise<{ token: string; installationId: string }> {
  const jwt = appJwt();
  let resolvedInstallationId = installationId;
  if (!resolvedInstallationId) {
    const installation = await githubRequest<{ id: number }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/installation`,
      jwt,
    );
    resolvedInstallationId = String(installation.id);
  }
  if (!/^\d+$/.test(resolvedInstallationId)) {
    throw new Error("Invalid GitHub App installation identifier.");
  }
  const result = await githubRequest<{ token: string }>(
    `/app/installations/${resolvedInstallationId}/access_tokens`,
    jwt,
    { method: "POST", body: "{}" },
  );
  return { token: result.token, installationId: resolvedInstallationId };
}

export async function publishGitHubCheck({
  owner,
  repo,
  installationId,
  commitSha,
  conclusion,
  title,
  summary,
}: {
  owner: string;
  repo: string;
  installationId: string;
  commitSha: string;
  conclusion: "success" | "failure";
  title: string;
  summary: string;
}): Promise<void> {
  const { token } = await installationTokenForRepository(
    owner,
    repo,
    installationId,
  );
  await githubRequest(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/check-runs`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        name: "VibeCheck Security Scan",
        head_sha: commitSha,
        status: "completed",
        conclusion,
        completed_at: new Date().toISOString(),
        output: {
          title: title.slice(0, 255),
          summary: summary.slice(0, 60_000),
        },
      }),
    },
  );
}

export function verifyGitHubWebhook(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) throw new Error("GitHub webhook secret is not configured.");
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const supplied = Buffer.from(signature.slice("sha256=".length), "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
