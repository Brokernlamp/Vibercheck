import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashToken } from "./crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const normalized = input.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, forTime = Date.now()): string {
  const counter = Math.floor(forTime / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function verifyTotp(
  secret: string,
  code: string,
  window = 1,
  forTime = Date.now(),
): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const supplied = Buffer.from(normalized);
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = Buffer.from(
      totpCode(secret, forTime + offset * 30_000),
    );
    if (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    ) {
      return true;
    }
  }
  return false;
}

export function otpauthUrl({
  secret,
  accountName,
  issuer = "VibeCheck",
}: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generateRecoveryCodes(count = 10): {
  plain: string[];
  hashes: string[];
} {
  const plain: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let value = "";
    const bytes = randomBytes(8);
    for (const byte of bytes) value += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    plain.push(`${value.slice(0, 4)}-${value.slice(4, 8)}`);
  }
  return {
    plain,
    hashes: plain.map((value) => hashToken(normalizeRecoveryCode(value))),
  };
}

export function consumeRecoveryCode(
  code: string,
  hashes: string[],
): { valid: boolean; remaining: string[] } {
  const hash = hashToken(normalizeRecoveryCode(code));
  const index = hashes.indexOf(hash);
  if (index === -1) return { valid: false, remaining: hashes };
  return {
    valid: true,
    remaining: hashes.filter((_, position) => position !== index),
  };
}
