import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decryptSecret } from "./crypto";
import { otpauthUrl } from "./mfa";

export async function loadMfaSetup(
  userId: string,
  email: string,
): Promise<{ secret: string; uri: string; enabled: boolean } | null> {
  const [record] = await db
    .select({ mfaSecret: users.mfaSecret, mfaEnabledAt: users.mfaEnabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!record?.mfaSecret) return null;
  try {
    const secret = decryptSecret(record.mfaSecret);
    return {
      secret,
      uri: otpauthUrl({ secret, accountName: email }),
      enabled: Boolean(record.mfaEnabledAt),
    };
  } catch {
    return null;
  }
}
