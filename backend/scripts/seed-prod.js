/**
 * Run seed against production database.
 * Uses .env.production. Production seeding only runs if
 * SEED_ALLOW_PRODUCTION=true is set in .env.production.
 */
process.env.ENV_FILE = '.env.production';

const path = require('path');
const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['tsx', 'prisma/seeders/seed.ts'], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
  cwd: path.join(__dirname, '..'),
});

process.exit(result.status ?? 1);
