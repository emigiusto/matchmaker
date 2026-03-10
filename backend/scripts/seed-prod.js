/**
 * Run seed against production database.
 * Uses .env.production for credentials.
 * Requires SEED_ALLOW_PRODUCTION to bypass env check.
 */
process.env.ENV_FILE = '.env.production';
process.env.SEED_ALLOW_PRODUCTION = 'true';
const path = require('path');
const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['tsx', 'prisma/seeders/seed.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
  cwd: path.join(__dirname, '..'),
});

process.exit(result.status ?? 1);
