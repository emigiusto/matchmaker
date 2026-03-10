/**
 * If DATABASE_URL is not set but DB_* vars are, build DATABASE_URL from them.
 * Usage: node scripts/ensure-database-url.js [command...]
 * If no command, just sets process.env.DATABASE_URL (for require() usage).
 * If command given, runs it with the env (e.g. for prisma generate).
 */
require('dotenv').config();

const d = process.env;
if (!d.DATABASE_URL && d.DB_HOST) {
  const dialect = d.DB_DIALECT || 'mysql';
  const user = d.DB_USER || 'root';
  const pass = encodeURIComponent(d.DB_PASSWORD || '');
  const host = d.DB_HOST;
  const port = d.DB_PORT || '3306';
  const name = d.DB_NAME || 'matchmaker';
  d.DATABASE_URL = `${dialect}://${user}:${pass}@${host}:${port}/${name}`;
}

const args = process.argv.slice(2);
if (args.length > 0) {
  const { spawnSync } = require('child_process');
  const r = spawnSync(args[0], args.slice(1), {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  process.exit(r.status ?? 1);
}
