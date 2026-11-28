import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { CardOptionsController } from './card-options.controller';
import { PrismaCardOptionsRepository } from './card-options.repository';
import { createCardConditionsRoutes, createCardOptionsRoutes } from './card-options.routes';
import { CardOptionsService } from './card-options.service';
import { registerCardConditionsDocs, registerCardOptionsDocs } from './card-options.swagger';

const controller = new CardOptionsController(
  new CardOptionsService(new PrismaCardOptionsRepository(prisma)),
);

export const cardOptionsModule: DomainModule = {
  basePath: '/cards',
  router: createCardOptionsRoutes(controller),
  registerDocs: registerCardOptionsDocs,
};

export const cardConditionsModule: DomainModule = {
  basePath: '/card-conditions',
  router: createCardConditionsRoutes(controller),
  registerDocs: registerCardConditionsDocs,
};

export { activeCardWhere } from './active-card';
