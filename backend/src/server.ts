import dotenv from 'dotenv';
import path from 'path';

// Resolve env from backend dir so it works when run from repo root or backend/
const backendDir = path.resolve(__dirname, '..');
const envFile = process.env.ENV_FILE || '.env.local';
const envPath = path.resolve(backendDir, envFile);
dotenv.config({ path: envPath });
import { ensureDatabaseUrl } from './config/database-url';
import { ensureRedisUrl } from './config/redis';

ensureDatabaseUrl();

import app from './app';
import { initRedisCache } from './shared/cache';

ensureRedisUrl();

const PORT = process.env.PORT || 3000;

// Initialize Redis cache (non-blocking, optional)
const redisUrl = process.env.REDIS_URL;
initRedisCache(redisUrl).then(() => {
  if (redisUrl) {
    console.log('[Redis] Initialization attempted');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
