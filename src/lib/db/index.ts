import PocketBase from 'pocketbase';

let cached: PocketBase | null = null;
let initPromise: Promise<PocketBase> | null = null;

async function initializeDb(): Promise<PocketBase> {
  if (cached) return cached;

  const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD');
  }

  // PocketBase v0.23+ uses _superusers; fall back to legacy admins for older versions
  try {
    await pb.collection('_superusers').authWithPassword(email, password);
  } catch {
    await (pb as any).admins.authWithPassword(email, password);
  }

  cached = pb;
  return pb;
}

export async function getDb(): Promise<PocketBase> {
  if (!initPromise) {
    initPromise = initializeDb();
  }
  return initPromise;
}

// Lazy proxy — resolves the PocketBase instance on first property access.
// Only works for method calls; use getDb() directly for property reads.
export const db = new Proxy({} as PocketBase, {
  get(_target, prop) {
    return async (...args: unknown[]) => {
      const instance = await getDb();
      const value = (instance as any)[prop as string];
      return typeof value === "function" ? value.apply(instance, args) : value;
    };
  },
});
