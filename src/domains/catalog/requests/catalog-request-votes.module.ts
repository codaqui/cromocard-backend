import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { CatalogRequestVotesController } from './catalog-request-votes.controller';
import { PrismaCatalogRequestVotesRepository } from './catalog-request-votes.repository';
import { createCatalogRequestVotesRoutes } from './catalog-request-votes.routes';
import { CatalogRequestVotesService } from './catalog-request-votes.service';
import { registerCatalogRequestVotesDocs } from './catalog-request-votes.swagger';

const service = new CatalogRequestVotesService(new PrismaCatalogRequestVotesRepository(prisma));

export const catalogRequestVotesModule: DomainModule = {
  basePath: '/catalog-requests',
  router: createCatalogRequestVotesRoutes(new CatalogRequestVotesController(service)),
  registerDocs: registerCatalogRequestVotesDocs,
};
