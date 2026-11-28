import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { prisma } from '@/lib/prisma';
import { createStorageProvider } from '@/providers/storage/storage.factory';

import { seedAdmin } from './admin.seed';
import { seedCatalog } from './catalog.seed';
import { seedChat, seedChatReports } from './chat.seed';
import { seedCollection } from './collection.seed';
import { seedCommunity } from './community.seed';
import { seedMarketplace } from './marketplace.seed';
import { uploadSampleEvidence, uploadSampleImages } from './sample-images';
import { seedOptionsFrom } from './seed-options';
import { seedSellerVerifications } from './seller-verifications.seed';
import { assertSeedEmailsAvailable, seedProfiles, seedUsers } from './users.seed';

/** Só o banco local recebe as imagens de exemplo; o compartilhado fica sem elas. */
async function seedWithSampleImages(isLocalDatabase: boolean): Promise<void> {
  const images = isLocalDatabase ? await uploadSampleImages(createStorageProvider()) : {};
  const evidenceKey = isLocalDatabase
    ? await uploadSampleEvidence(createStorageProvider('private'))
    : undefined;
  await seedAdmin(prisma, images);
  await seedChatReports(prisma, evidenceKey);
  await seedProfiles(prisma, images.avatarUrl);
}

async function seed(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('O seed cria dados de teste e não roda em produção.');
  }

  const options = seedOptionsFrom({
    databaseUrl: env.DATABASE_URL,
    userPassword: env.SEED_USER_PASSWORD,
  });

  await assertSeedEmailsAvailable(prisma);
  await seedUsers(prisma, options.userPassword);
  await seedCatalog(prisma);
  await seedCollection(prisma);
  await seedCommunity(prisma);
  await seedSellerVerifications(prisma);
  await seedMarketplace(prisma);
  await seedChat(prisma);
  await seedWithSampleImages(options.isLocalDatabase);

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
