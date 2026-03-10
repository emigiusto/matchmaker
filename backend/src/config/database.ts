// src/config/database.ts
// Database URL resolution (DB_* vars) and PrismaClient singleton

import { PrismaClient } from '@prisma/client';

/** Build DATABASE_URL from DB_* vars if not set (for Render, Docker, etc.) */
export function ensureDatabaseUrl(): void {
  const d = process.env;
  if (d.DATABASE_URL || !d.DB_HOST) return;
  const dialect = d.DB_DIALECT || 'mysql';
  const user = d.DB_USER || 'root';
  const pass = encodeURIComponent(d.DB_PASSWORD || '');
  const host = d.DB_HOST;
  const port = d.DB_PORT || '3306';
  const name = d.DB_NAME || 'matchmaker';
  process.env.DATABASE_URL = `${dialect}://${user}:${pass}@${host}:${port}/${name}`;
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
