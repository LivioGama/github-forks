import { PostgresDB } from "./postgres";
import PocketBase from "pocketbase";

/** The project can run against PocketBase **or** a PostgreSQL (Neon) database.
 *  The environment variable `POSTGRES_URL` (Neon connection string) takes precedence.
 *  When it is present we spin up a `PostgresDB` instance; otherwise we fall back
 *  to the original PocketBase client.
 */

let cached: PocketBase | PostgresDB | null = null;
let initPromise: Promise<PocketBase | PostgresDB> | null = null;

/** PocketBase‑specific authentication – retained for local/dev usage. */
async function authenticateSuperuser(pb: PocketBase): Promise<void> {
  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD"
    );
  }

  try {
    await pb.collection("_superusers").authWithPassword(email, password);
  } catch {
    // Fallback for older PocketBase versions
    await (pb as any).admins.authWithPassword(email, password);
  }
}

/** Initialise the appropriate DB client based on env vars. */
async function initializeDb(): Promise<PocketBase | PostgresDB> {
  if (cached) return cached;

  const pgUrl = process.env.POSTGRES_URL;
  if (pgUrl) {
    const pg = new PostgresDB(pgUrl);
    cached = pg;
    return pg;
  }

  const pb = new PocketBase(
    process.env.POCKETBASE_URL || "http://localhost:8090"
  );
  await authenticateSuperuser(pb);
  cached = pb;
  return pb;
}

export async function getDb(): Promise<PocketBase | PostgresDB> {
  if (!initPromise) {
    initPromise = initializeDb();
  }
  const db = await initPromise;

  // PocketBase token refresh logic (only relevant when using PocketBase)
  if (db instanceof PocketBase && !db.authStore.isValid) {
    try {
      await authenticateSuperuser(db);
    } catch (err) {
      cached = null;
      initPromise = null;
      throw err;
    }
  }
  return db;
}

/** Lazy proxy – resolves the DB client on first property access.
 *  It works for method calls (`collection(...)`) which is the only usage
 *  pattern in the codebase.
 */
export const db = new Proxy({} as any, {
  get(_target, prop) {
    return async (...args: unknown[]) => {
      const instance = await getDb();
      const value = (instance as any)[prop as string];
      return typeof value === "function"
        ? value.apply(instance, args)
        : value;
    };
  },
});
