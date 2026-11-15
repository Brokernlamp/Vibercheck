import { randomBytes } from "node:crypto";

async function main(): Promise<void> {
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd());

  const { db } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { hashPassword } = await import("../src/lib/password");
  const { checkPassword } = await import("../src/lib/password-policy");
  const { eq } = await import("drizzle-orm");

  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to a valid operator email.");
  }
  if (name.length < 2) {
    throw new Error("Set ADMIN_NAME to the operator's full name.");
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new Error(`An account for ${email} already exists.`);
  }

  const generated = !process.env.ADMIN_PASSWORD;
  const password =
    process.env.ADMIN_PASSWORD ??
    `${randomBytes(18).toString("base64url")}a1`;
  const policy = checkPassword(password, { email, name });
  if (!policy.ok) throw new Error(policy.error);

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      email,
      name,
      role: "ADMIN",
      passwordHash,
      emailVerifiedAt: new Date(),
      lastLoginAt: null,
    })
    .returning({ id: users.id });

  console.log(`Created operator ${email} (${created.id}).`);
  if (generated) {
    console.log(`Temporary password: ${password}`);
    console.log("Store it now, sign in, and change it from Security & sessions.");
  }
  console.log("Sign in at /login. MFA setup is recommended immediately.");
  await db.$client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
