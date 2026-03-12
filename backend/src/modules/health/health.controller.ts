// health.controller.ts
// Serves health stats at GET /

import { Request, Response } from 'express';
import { getHealthStats } from './health.service';
import type { HealthStats } from './health.service';

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
function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function renderWelcomeHtml(stats: HealthStats): string {
  const statusColor =
    stats.status === 'ok'
      ? '#22c55e'
      : stats.status === 'degraded'
        ? '#f59e0b'
        : '#ef4444';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Matchmaker API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'DM Sans', system-ui, -apple-system, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      min-height: 100vh;
      color: #e2e8f0;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 520px;
      width: 100%;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      background: linear-gradient(90deg, #38bdf8, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .subtitle {
      color: #94a3b8;
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1.5rem;
      background: ${statusColor}22;
      color: ${statusColor};
      border: 1px solid ${statusColor}44;
    }
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${statusColor};
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    .card {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(148, 163, 184, 0.12);
      border-radius: 12px;
      padding: 1.25rem;
      transition: border-color 0.2s;
    }
    .card:hover {
      border-color: rgba(148, 163, 184, 0.25);
    }
    .card-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 0.35rem;
    }
    .card-value {
      font-size: 1.25rem;
      font-weight: 600;
    }
    .card-value.connected { color: #22c55e; }
    .card-value.disconnected { color: #ef4444; }
    .card.full-width { grid-column: 1 / -1; }
    .footer {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: #64748b;
    }
    .footer a {
      color: #38bdf8;
      text-decoration: none;
    }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Matchmaker API</h1>
    <p class="subtitle">Organize sports matches • Player availability • WhatsApp notifications</p>
    <div class="status-badge">
      <span class="status-dot"></span>
      ${stats.status}
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-label">Uptime</div>
        <div class="card-value">${formatUptime(stats.uptimeSeconds)}</div>
      </div>
      <div class="card">
        <div class="card-label">Version</div>
        <div class="card-value">v${stats.version}</div>
      </div>
      <div class="card">
        <div class="card-label">Database</div>
        <div class="card-value ${stats.database.connected ? 'connected' : 'disconnected'}">
          ${stats.database.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div class="card">
        <div class="card-label">Redis</div>
        <div class="card-value ${stats.redis.connected ? 'connected' : 'disconnected'}">
          ${stats.redis.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      <div class="card full-width">
        <div class="card-label">Stats</div>
        <div class="card-value" style="font-size: 1rem; color: inherit;">
          ${stats.database.users} users • ${stats.database.matches} matches • ${stats.database.players} players
        </div>
      </div>
      <div class="card">
        <div class="card-label">Environment</div>
        <div class="card-value" style="font-size: 1rem;">${stats.environment}</div>
      </div>
      <div class="card">
        <div class="card-label">Background Jobs</div>
        <div class="card-value" style="font-size: 1rem;">${stats.jobsEnabled ? 'Enabled' : 'Disabled'}</div>
      </div>
    </div>
    <p class="footer">
      API docs: <a href="/api-docs">/api-docs</a> • JSON: <a href="/health">/health</a>
    </p>
  </div>
</body>
</html>`;
}

export class HealthController {
  static async index(req: Request, res: Response) {
    const stats = await getHealthStats();
    const statusCode = stats.status === 'down' ? 503 : 200;

    const acceptsHtml =
      req.path === '/' &&
      req.accepts('html') === 'html';

    if (acceptsHtml) {
      res.status(statusCode).type('html').send(renderWelcomeHtml(stats));
    } else {
      res.status(statusCode).json(stats);
    }
  }
}
