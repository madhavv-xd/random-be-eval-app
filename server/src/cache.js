// TTL cache with two backends behind the same three functions:
//   - REDIS_URL set (e.g. Upstash): Redis GET / SET PX / DEL, shared by every API instance.
//   - otherwise: an in-process Map, so local dev needs no setup.
// Callers never know which one is active.
import mongoose from 'mongoose';
import { Redis } from 'ioredis';

export const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: false })
  : null;
redis?.on('error', (err) => console.error('[redis]', err.message));

export const cacheBackend = redis ? 'redis' : 'memory';

// Cached values contain ObjectIds (follow lists, ranked post ids) that go straight back into
// aggregation pipelines, which don't cast strings. So they're tagged on the way into Redis and revived on the way out.
const { ObjectId } = mongoose.Types;
function encode(value) {
  return JSON.stringify(value, function (key, v) {
    return this[key] instanceof ObjectId ? { $oid: v } : v;
  });
}
const decode = (text) => JSON.parse(text, (key, v) => (v && typeof v === 'object' && typeof v.$oid === 'string' ? new ObjectId(v.$oid) : v));

const store = new Map();

export async function cached(key, ttlMs, compute) {
  if (process.env.NO_CACHE) return compute(); // for benchmarking with and without the cache

  if (redis) {
    const hit = await redis.get(key).catch(() => null); // Redis down → fall through to the database
    if (hit !== null) return decode(hit);
    const value = await compute();
    redis.set(key, encode(value), 'PX', ttlMs).catch(() => {});
    return value;
  }

  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export async function invalidate(...keys) {
  if (!keys.length) return;
  for (const key of keys) store.delete(key);
  if (redis) await redis.del(...keys).catch(() => {});
}

export async function clearCache() {
  store.clear();
  // Only our own key prefixes, so a shared Redis isn't wiped.
  if (redis) {
    for (const prefix of ['following:', 'ranked:', 'feed:', 'trending']) {
      const keys = await redis.keys(`${prefix}*`).catch(() => []);
      if (keys.length) await redis.del(...keys).catch(() => {});
    }
  }
}
