// Tiny TTL cache: the local stand-in for Redis.
// ponytail: per-process Map, so each server instance has its own copy and invalidation doesn't cross instances.
// Swap the three functions for Redis GET/SETEX/DEL (same keys and TTLs) when running more than one instance.
const store = new Map();

export async function cached(key, ttlMs, compute) {
  if (process.env.NO_CACHE) return compute(); // for benchmarking with and without the cache
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidate(...keys) {
  for (const key of keys) store.delete(key);
}

export const clearCache = () => store.clear();
