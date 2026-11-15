import { cookies } from "next/headers";
import { signPayload, verifySignedPayload } from "./crypto";
import { isProduction } from "./env";

const CHALLENGE_COOKIE = isProduction()
  ? "__Host-vibecheck_mfa_challenge"
  : "vibecheck_mfa_challenge";
const CHALLENGE_SECONDS = 10 * 60;

export async function setMfaChallenge(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(
    CHALLENGE_COOKIE,
    signPayload({ sub: userId, kind: "mfa" }, CHALLENGE_SECONDS),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: "/",
      maxAge: CHALLENGE_SECONDS,
    },
  );
}

export async function readMfaChallenge(): Promise<string | null> {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  const payload = verifySignedPayload<{ sub?: string; kind?: string }>(token);
  if (!payload || payload.kind !== "mfa" || typeof payload.sub !== "string") {
    return null;
  }
  return payload.sub;
}

export async function clearMfaChallenge(): Promise<void> {
  (await cookies()).delete(CHALLENGE_COOKIE);
}
