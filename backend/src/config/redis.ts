// src/config/redis.ts
// Build REDIS_URL from REDIS_* vars (for Render, etc.)

/** Build REDIS_URL from REDIS_* vars if not set. Sets process.env.REDIS_URL. */
export function ensureRedisUrl(): void {
  const d = process.env;
  if (d.REDIS_URL || !d.REDIS_HOST) return;

  const scheme = d.REDIS_TLS === 'true' ? 'rediss' : 'redis';
  const host = d.REDIS_HOST;
  const port = d.REDIS_PORT || '6379';

  let auth = '';
  if (d.REDIS_USERNAME || d.REDIS_PASSWORD) {
    const user = encodeURIComponent(d.REDIS_USERNAME || '');
    const pass = encodeURIComponent(d.REDIS_PASSWORD || '');
    auth = user && pass ? `${user}:${pass}@` : pass ? `:${pass}@` : '';
  }

  process.env.REDIS_URL = `${scheme}://${auth}${host}:${port}`;
}
