import PocketBase from 'pocketbase';

let cached: PocketBase | null = null;
let initPromise: Promise<PocketBase> | null = null;

async function authenticateSuperuser(pb: PocketBase): Promise<void> {
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
}

async function initializeDb(): Promise<PocketBase> {
  if (cached) return cached;

  const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');
  await authenticateSuperuser(pb);

  cached = pb;
  return pb;
}

export async function getDb(): Promise<PocketBase> {
  if (!initPromise) {
    initPromise = initializeDb();
  }

  const pb = await initPromise;

  // The superuser auth token has a TTL and is also invalidated when
  // PocketBase restarts. A long-lived cached client eventually holds a
  // stale token, after which every write fails with
  // "Only superusers can perform this action". Re-authenticate whenever
  // the stored token is no longer valid so callers always get a live
  // superuser session.
  if (!pb.authStore.isValid) {
    try {
      await authenticateSuperuser(pb);
    } catch (err) {
      // Drop the cache so the next call rebuilds from scratch.
      cached = null;
      initPromise = null;
      throw err;
    }
  }

  return pb;
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
