import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { PrismaCollectionCardsRepository } from './collection-cards.repository';
import { PrismaListingPrices } from './collection-listing-prices.repository';
import { PrismaCollectionPrices } from './collection-prices.repository';
import { CollectionController } from './collection.controller';
import { PrismaCollectionRepository } from './collection.repository';
import { createCollectionRoutes } from './collection.routes';
import { CollectionService } from './collection.service';
import { registerCollectionDocs } from './collection.swagger';

const collectionService = new CollectionService({
  collections: new PrismaCollectionRepository(prisma),
  cards: new PrismaCollectionCardsRepository(prisma),
  prices: new PrismaCollectionPrices(prisma),
  listings: new PrismaListingPrices(prisma),
  now: () => new Date(),
});

export const collectionModule: DomainModule = {
  basePath: '/collections',
  router: createCollectionRoutes(new CollectionController(collectionService)),
  registerDocs: registerCollectionDocs,
};
