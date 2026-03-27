// src/config/database.ts
// Prisma client instance

import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';

const isAccelerateUrl = process.env.DATABASE_URL?.startsWith('prisma://') || process.env.DATABASE_URL?.startsWith('prisma+postgres://');

const prisma = isAccelerateUrl
  ? new PrismaClient().$extends(withAccelerate())
  : new PrismaClient();

export default prisma as PrismaClient;
