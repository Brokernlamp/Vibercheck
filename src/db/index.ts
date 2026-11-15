import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://localhost:5432/vibecheck";

const globalForDb = globalThis as unknown as {
  __vibecheckClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__vibecheckClient ??
  postgres(connectionString, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__vibecheckClient = client;
}

export const db = drizzle(client, { schema });
export { client as sqlClient };
export * from "./schema";
