import { listingsService } from '@/domains/marketplace/listings/listings.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { CardsController } from './cards.controller';
import { PrismaCardsRepository } from './cards.repository';
import { createCardsRoutes } from './cards.routes';
import { CardsService } from './cards.service';
import { registerCardsDocs } from './cards.swagger';

const service = new CardsService(new PrismaCardsRepository(prisma), listingsService);

export const cardsModule: DomainModule = {
  basePath: '/cards',
  router: createCardsRoutes(new CardsController(service)),
  registerDocs: registerCardsDocs,
};
