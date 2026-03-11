// health.controller.ts
// Serves health stats at GET /

import { Request, Response } from 'express';
import { getHealthStats } from './health.service';

/**
 * @openapi
 * /:
 *   get:
 *     summary: Health stats (root)
 *     description: Returns API health status, uptime, DB and Redis connectivity
 *     tags: [Health]
 *     responses:
 *       200: { description: API is healthy }
 *       503: { description: API is down (database unreachable) }
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns API health status, uptime, DB and Redis connectivity. Use for monitoring and load balancer probes.
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy (or degraded if Redis down but DB up)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, enum: [ok, degraded, down] }
 *                 uptimeSeconds: { type: number }
 *                 environment: { type: string }
 *                 version: { type: string }
 *                 database: { type: object, properties: { connected: { type: boolean }, users: { type: number }, matches: { type: number }, players: { type: number } } }
 *                 redis: { type: object, properties: { connected: { type: boolean } } }
 *                 jobsEnabled: { type: boolean }
 *       503:
 *         description: API is down (database unreachable)
 */
export class HealthController {
  static async index(_req: Request, res: Response) {
    const stats = await getHealthStats();
    const statusCode = stats.status === 'down' ? 503 : 200;
    res.status(statusCode).json(stats);
  }
}
