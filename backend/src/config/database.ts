
// src/config/database.ts
// PrismaClient singleton setup and graceful shutdown

import { PrismaClient } from '@prisma/client';

// Ensure a single shared PrismaClient instance
const prisma = new PrismaClient();

// Graceful shutdown
if (typeof process !== 'undefined' && process && process.on) {
	process.on('SIGINT', async () => {
		await prisma.$disconnect();
		process.exit(0);
	});
	process.on('SIGTERM', async () => {
		await prisma.$disconnect();
		process.exit(0);
	});
}

export default prisma;
