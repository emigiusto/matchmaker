// redis.ts
// Isolated Redis cache client for optional caching
// The app will start even if Redis is unavailable. Use only if connected.

import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let isReady = false;
let hasLoggedError = false; // Add this flag

export async function initRedisCache(url?: string) {
  if (!url) return;
  client = createClient({ url });
  client.on('error', (err) => {
    isReady = false;
    if (!hasLoggedError) {
      console.warn('[Redis] Connection error:', err.message);
      hasLoggedError = true; // Only log the first error
    }
  });
  client.on('ready', () => {
    isReady = true;
    hasLoggedError = false; // Reset flag on successful connection
    console.info('[Redis] Connected');
  });
  try {
    await client.connect();
  } catch (err: any) {
    isReady = false;
    if (!hasLoggedError) {
      console.warn('[Redis] Initial connection failed:', err.message);
      hasLoggedError = true;
    }
  }
}

export function redisAvailable() {
  return isReady && client !== null;
}

export function getRedisClient(): RedisClientType | null {
  return redisAvailable() ? client : null;
}

// Example cache helpers
export async function cacheGet(key: string): Promise<string | null> {
  if (!redisAvailable()) return null;
  return client!.get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number) {
  if (!redisAvailable()) return;
  try {
    if (ttlSeconds) {
      await client!.set(key, value, { EX: ttlSeconds });
    } else {
      await client!.set(key, value);
    }
  } catch (err: any) {
    console.error('[Redis] cacheSet failed for key "%s":', key, err.message);
  }
}

export async function cacheDel(key: string) {
  if (!redisAvailable()) return;
  try {
    await client!.del(key);
  } catch (err: any) {
    console.error('[Redis] cacheDel failed for key "%s":', key, err.message);
  }
}

export async function deleteKeysByPattern(pattern: string) {
  const client = getRedisClient();
  if (!client) return;

  let cursor = '0';

  try {
    do {
      const { cursor: nextCursor, keys } = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });

      cursor = nextCursor;

      if (keys.length > 0) {
        await client.del(keys);
      }
    } while (cursor !== '0');
  } catch (err: any) {
    console.error('[Redis] deleteKeysByPattern failed for pattern "%s":', pattern, err.message);
  }
}
