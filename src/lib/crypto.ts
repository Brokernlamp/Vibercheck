import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { sessionSecret } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmac(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

/** A compact signed value for short-lived, tamper-evident cookies. */
export function signPayload(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): string {
  const body = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    nonce: randomToken(12),
  };
  const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${encoded}.${hmac(encoded)}`;
}

export function verifySignedPayload<T = Record<string, unknown>>(
  token: string | undefined | null,
): T | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  if (!safeEqual(signature, hmac(encoded))) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as T & { exp?: number };
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** HMAC-hashed network identifier. Raw IP addresses are never persisted. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", sessionSecret()).update(ip).digest("hex").slice(0, 32);
}

const ENCRYPTION_PREFIX = "v1";

export function encryptSecret(plaintext: string): string {
  const key = createHash("sha256")
    .update(`mfa:${sessionSecret()}`)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  const [version, ivPart, tagPart, cipherPart] = value.split(":");
  if (version !== ENCRYPTION_PREFIX || !ivPart || !tagPart || !cipherPart) {
    throw new Error("Unsupported encrypted value");
  }
  const key = createHash("sha256")
    .update(`mfa:${sessionSecret()}`)
    .digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
