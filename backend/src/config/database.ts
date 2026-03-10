// src/config/database.ts
// Database URL resolution (DB_* vars) and PrismaClient singleton

import { PrismaClient } from '@prisma/client';

/** Build DATABASE_URL from DB_* vars if not set (for Render, Docker, etc.) */
export function ensureDatabaseUrl(): void {
  const d = process.env;
  if (d.DATABASE_URL || !d.DB_HOST) return;
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
    params.push(`sslaccept=${d.SSL_REJECT_UNAUTHORIZED === 'true' || d.SSL_REJECT_UNAUTHORIZED === '1' ? 'strict' : 'accept_invalid_certs'}`);
  }
  if (params.length) url += '?' + params.join('&');
  process.env.DATABASE_URL = url;
}

ensureDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['info', 'warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Graceful shutdown
if (typeof process !== 'undefined' && process?.on) {
  process.on('SIGINT', () => prisma.$disconnect().then(() => process.exit(0)));
  process.on('SIGTERM', () => prisma.$disconnect().then(() => process.exit(0)));
}

export default prisma;
