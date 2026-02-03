import dotenv from 'dotenv';

import app from './app';
import { initRedisCache } from './shared/cache';

// Load environment variables from .env file
dotenv.config();

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
