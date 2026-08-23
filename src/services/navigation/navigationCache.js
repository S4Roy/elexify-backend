// Simple in-process, module-level TTL cache — no Redis (single Node process
// assumption; if this app ever runs multi-process/PM2 cluster, each process
// would hold its own cache and publish-invalidation would need a broadcast
// mechanism instead of this in-memory Map).
const store = new Map(); // key -> { value, expiresAt }
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export const cacheGet = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

export const cacheSet = (key, value, ttlMs = DEFAULT_TTL_MS) => {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const invalidate = (key = "site:navigation:config") => {
  store.delete(key);
};
