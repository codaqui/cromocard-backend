import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/lib/prisma';

import { seedAdmin } from './admin.seed';
import { seedCatalog } from './catalog.seed';
import { seedCommunity } from './community.seed';
import { SEED_PASSWORD, seedUsers } from './users.seed';

async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed cria dados de teste e não roda em produção.');
  }

  await seedUsers(prisma);
  await seedCatalog(prisma);
  await seedCommunity(prisma);
  await seedAdmin(prisma);

  logger.info(`Seed concluído. Login: admin@cromocard.dev / ${SEED_PASSWORD}`);
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
