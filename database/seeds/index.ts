import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/lib/prisma';
import { createStorageProvider } from '@/providers/storage/storage.factory';

import { seedAdmin } from './admin.seed';
import { seedCatalog } from './catalog.seed';
import { seedCommunity } from './community.seed';
import { seedOptionsFrom } from './seed-options';
import { seedUsers } from './users.seed';

async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed cria dados de teste e não roda em produção.');
  }

  const options = seedOptionsFrom({
    databaseUrl: env.DATABASE_URL,
    userPassword: env.SEED_USER_PASSWORD,
  });

  await seedUsers(prisma, options.userPassword);
  await seedCatalog(prisma);
  await seedCommunity(prisma);
  await seedAdmin(prisma, options.uploadsSampleFiles ? createStorageProvider() : undefined);

  logger.info(
    options.isLocalDatabase
      ? 'Seed concluído. O login do admin de teste está no README.'
      : 'Seed concluído no banco compartilhado, sem o banner de exemplo. Os usuários de teste usam a SEED_USER_PASSWORD.',
  );
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
