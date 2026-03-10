/**
 * If DATABASE_URL is not set but DB_* vars are, build DATABASE_URL from them.
 * Usage: node scripts/ensure-database-url.js [command...]
 * If no command, just sets process.env.DATABASE_URL (for require() usage).
 * If command given, runs it with the env (e.g. for prisma generate).
 */
try {
  const path = require('path');
  const envFile = process.env.ENV_FILE || '.env';
  require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
} catch (_) {
  // dotenv not available (e.g. Render CI) - rely on process.env from platform
}

const d = process.env;
if (!d.DATABASE_URL && d.DB_HOST) {
  const dialect = d.DB_DIALECT || 'mysql';
  const user = d.DB_USER || d.DB_USERNAME || 'root';
  const pass = encodeURIComponent(d.DB_PASSWORD || '');
  const host = d.DB_HOST;
  const port = d.DB_PORT || '3306';
  const name = d.DB_NAME || 'matchmaker';
  let url = `${dialect}://${user}:${pass}@${host}:${port}/${name}`;
  const params = [];
  if (d.DB_SSL_ACCEPT) params.push(`sslaccept=${d.DB_SSL_ACCEPT}`);
  else if (d.DB_SSL_CERT) params.push(`sslcert=${d.DB_SSL_CERT}`);
  else if (d.SSL_REQUIRE === 'true' || d.SSL_REQUIRE === '1') {
    params.push(`sslaccept=${d.SSL_REJECT_UNAUTHORIZED === 'true' || d.SSL_REJECT_UNAUTHORIZED === '1' ? 'strict' : 'accept_invalid_certs'}`);
  }
  if (params.length) url += '?' + params.join('&');
  d.DATABASE_URL = url;
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
