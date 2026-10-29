// Load-tests the feed endpoints with autocannon. Start the API first (`npm run dev`), then `npm run bench`.
// To compare with the cache disabled, restart the API with NO_CACHE=1 and run this again.
import autocannon from 'autocannon';

const base = process.env.BENCH_URL || 'http://localhost:4000';
const { token } = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: 'maya', password: 'password123' }),
}).then((r) => r.json());
if (!token) throw new Error('Login failed: is the API running and seeded?');

console.log(`${'endpoint'.padEnd(34)} ${'req/s'.padStart(7)} ${'p50'.padStart(7)} ${'p90'.padStart(7)} ${'p97.5'.padStart(7)}`);
for (const path of ['/api/feed?limit=10', '/api/feed?sort=ranked&limit=10', '/api/explore?limit=10', '/api/explore/trending']) {
  const r = await autocannon({ url: base + path, connections: 20, duration: 8, headers: { authorization: `Bearer ${token}` } });
  const ms = (v) => `${v}ms`.padStart(7);
  console.log(`${path.padEnd(34)} ${String(Math.round(r.requests.average)).padStart(7)} ${ms(r.latency.p50)} ${ms(r.latency.p90)} ${ms(r.latency.p97_5)}`);
}
