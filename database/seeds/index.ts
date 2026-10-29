import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/lib/prisma';
import { createStorageProvider } from '@/providers/storage/storage.factory';

import { seedAdmin } from './admin.seed';
import { seedCatalog } from './catalog.seed';
import { seedCommunity } from './community.seed';
import { seedUsers } from './users.seed';

async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed cria dados de teste e não roda em produção.');
  }

  await seedUsers(prisma);
  await seedCatalog(prisma);
  await seedCommunity(prisma);
  await seedAdmin(prisma, createStorageProvider());

  logger.info('Seed concluído. O login do admin de teste está no README.');
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
