// health.service.ts
// Aggregates health stats for the API root page

import { prisma } from '../../prisma';
import { redisAvailable } from '../../shared/cache/redis';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../../package.json') as { version?: string };

export interface HealthStats {
  status: 'ok' | 'degraded' | 'down';
  uptimeSeconds: number;
  environment: string;
  version: string;
  database: {
    connected: boolean;
    users: number;
    matches: number;
    players: number;
  };
  redis: {
    connected: boolean;
  };
  jobsEnabled: boolean;
}

export async function getHealthStats(): Promise<HealthStats> {
  const uptimeSeconds = Math.floor(process.uptime());
  const environment = process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown';
  const version = pkg?.version || process.env.npm_package_version || '1.0.0';
  const jobsEnabled = process.env.JOBS_ENABLED === 'true';

  let dbConnected = false;
  let users = 0;
  let matches = 0;
  let players = 0;

  try {
    const [userCount, matchCount, playerCount] = await Promise.all([
      prisma.user.count(),
      prisma.match.count(),
      prisma.player.count(),
    ]);
    dbConnected = true;
    users = userCount;
    matches = matchCount;
    players = playerCount;
  } catch {
    dbConnected = false;
  }

  const redisConnected = redisAvailable();

  let status: HealthStats['status'] = 'ok';
  if (!dbConnected) status = 'down';
  else if (!redisConnected && process.env.REDIS_URL) status = 'degraded';

  return {
    status,
    uptimeSeconds,
    environment,
    version,
    database: {
      connected: dbConnected,
      users,
      matches,
      players,
    },
    redis: {
      connected: redisConnected,
    },
    jobsEnabled,
  };
}
