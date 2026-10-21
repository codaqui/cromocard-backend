import { auditLogsService } from '@/domains/admin/audit-logs/audit-logs.module';
import { albumsService } from '@/domains/catalog/albums/albums.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { CardsController } from './cards.controller';
import { PrismaCardsRepository } from './cards.repository';
import { createCardsRoutes } from './cards.routes';
import { CardsService } from './cards.service';
import { registerCardsDocs } from './cards.swagger';

const cardsService = new CardsService({
  cardsRepository: new PrismaCardsRepository(prisma),
  albumsService,
  auditLogs: auditLogsService,
});

export const cardsModule: DomainModule = {
  basePath: '/cards',
  router: createCardsRoutes(new CardsController(cardsService)),
  registerDocs: registerCardsDocs,
};

export { cardsService };
