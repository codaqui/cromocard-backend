import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '@/config/env';
import { PrismaClient } from '@/generated/prisma/client';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** Verifica a conexão com o banco. Lança erro se o banco estiver indisponível. */
export async function pingDatabase(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
