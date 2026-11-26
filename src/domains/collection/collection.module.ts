import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { PrismaCollectionCardsRepository } from './collection-cards.repository';
import { noListingsYet } from './collection-listing-prices';
import { noPriceHistoryYet } from './collection-prices';
import { CollectionController } from './collection.controller';
import { PrismaCollectionRepository } from './collection.repository';
import { createCollectionRoutes } from './collection.routes';
import { CollectionService } from './collection.service';
import { registerCollectionDocs } from './collection.swagger';

const collectionService = new CollectionService({
  collections: new PrismaCollectionRepository(prisma),
  cards: new PrismaCollectionCardsRepository(prisma),
  prices: noPriceHistoryYet,
  listings: noListingsYet,
  now: () => new Date(),
});

export const collectionModule: DomainModule = {
  basePath: '/collections',
  router: createCollectionRoutes(new CollectionController(collectionService)),
  registerDocs: registerCollectionDocs,
};
