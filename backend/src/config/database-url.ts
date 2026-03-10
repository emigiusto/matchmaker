// src/config/database-url.ts
// Build or patch DATABASE_URL for Prisma (SSL for self-signed certs, etc.)

const SSL_ACCEPT_PARAM = 'sslaccept=accept_invalid_certs';

/** Ensure DATABASE_URL exists and has SSL params when using self-signed certs. */
export function ensureDatabaseUrl(): void {
  const d = process.env;

  // Build from DB_* if DATABASE_URL not set
  if (!d.DATABASE_URL && d.DB_HOST) {
    const dialect = d.DB_DIALECT || 'mysql';
    const user = d.DB_USER || d.DB_USERNAME || 'root';
    const pass = encodeURIComponent(d.DB_PASSWORD || '');
    const host = d.DB_HOST;
    const port = d.DB_PORT || '3306';
    const name = d.DB_NAME || 'matchmaker';
    let url = `${dialect}://${user}:${pass}@${host}:${port}/${name}`;
    const params: string[] = [];
    if (d.DB_SSL_ACCEPT) params.push(`sslaccept=${d.DB_SSL_ACCEPT}`);
    else if (d.DB_SSL_CERT) params.push(`sslcert=${d.DB_SSL_CERT}`);
    else if (d.SSL_REQUIRE === 'true' || d.SSL_REQUIRE === '1') {
      params.push(
        d.SSL_REJECT_UNAUTHORIZED === 'true' || d.SSL_REJECT_UNAUTHORIZED === '1'
          ? 'sslaccept=strict'
          : SSL_ACCEPT_PARAM
      );
    } else {
      params.push(SSL_ACCEPT_PARAM); // default for cloud MySQL
    }
    if (params.length) url += '?' + params.join('&');
    d.DATABASE_URL = url;
    return;
  }

  // DATABASE_URL is set - append sslaccept if needed (for self-signed certs)
  if (d.DB_SSL_STRICT === 'true' || d.DB_SSL_STRICT === '1') return; // skip - use strict verification
  let sslAccept = d.DB_SSL_ACCEPT;
  if (!sslAccept && (d.SSL_REQUIRE === 'true' || d.SSL_REQUIRE === '1')) {
    sslAccept =
      d.SSL_REJECT_UNAUTHORIZED === 'true' || d.SSL_REJECT_UNAUTHORIZED === '1' ? 'strict' : 'accept_invalid_certs';
  }
  // Default to accept_invalid_certs for cloud MySQL (Aiven, Render, DO, etc.)
  if (!sslAccept) sslAccept = 'accept_invalid_certs';
  if (sslAccept === 'strict') return; // skip patching - use server's default

  let url = d.DATABASE_URL;
  if (!url || url.includes('sslaccept=')) return;

  const param = `sslaccept=${sslAccept}`;
  const sep = url.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = url + sep + param;
}
