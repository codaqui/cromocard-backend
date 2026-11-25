import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { PublicCardsController } from './public-cards.controller';
import { PrismaPublicCardsRepository } from './public-cards.repository';
import { createCardConditionsRoutes, createPublicCardsRoutes } from './public-cards.routes';
import { PublicCardsService } from './public-cards.service';
import { registerCardConditionsDocs, registerPublicCardsDocs } from './public-cards.swagger';

const controller = new PublicCardsController(
  new PublicCardsService(new PrismaPublicCardsRepository(prisma)),
);

export const publicCardsModule: DomainModule = {
  basePath: '/cards',
  router: createPublicCardsRoutes(controller),
  registerDocs: registerPublicCardsDocs,
};

export const cardConditionsModule: DomainModule = {
  basePath: '/card-conditions',
  router: createCardConditionsRoutes(controller),
  registerDocs: registerCardConditionsDocs,
};
