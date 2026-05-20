// Module-level in-memory cache. Survives React unmount/remount (page navigation)
// but resets on hard refresh. Uses stale-while-revalidate: return cached data
// immediately, then silently re-fetch in the background.

const store = new Map();

/**
 * Read a cached value. Returns null if missing or expired.
 */
export function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttl) { store.delete(key); return null; }
  return entry.data;
}

/**
 * Write a value to the cache.
 * @param {string} key
 * @param {*} data
 * @param {number} ttlMs  default 2 minutes
 */
export function setCache(key, data, ttlMs = 120_000) {
  store.set(key, { data, ts: Date.now(), ttl: ttlMs });
}

/**
 * Invalidate all keys that start with a given prefix.
 * e.g. invalidateCache(`profile:${uid}`) clears that user's profile cache.
 */
export function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
