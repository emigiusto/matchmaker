import dotenv from 'dotenv';
import path from 'path';

const envFile = process.env.ENV_FILE || '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

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
