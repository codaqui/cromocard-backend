import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { catalogService } from '@/domains/catalog/catalog.module';
import { PrismaCatalogRequestVotesRepository } from './catalog-request-votes.repository';
import { CatalogRequestsController } from './catalog-requests.controller';
import { PrismaCatalogRequestsRepository } from './catalog-requests.repository';
import { createCatalogRequestsRoutes } from './catalog-requests.routes';
import { CatalogRequestsService } from './catalog-requests.service';
import { registerCatalogRequestsDocs } from './catalog-requests.swagger';

const catalogRequestsService = new CatalogRequestsService({
  repository: new PrismaCatalogRequestsRepository(prisma),
  catalog: catalogService,
  auditLog: auditLogService,
  votes: new PrismaCatalogRequestVotesRepository(prisma),
  notifier: notificationsService,
  runInTransaction,
});

export const catalogRequestsModule: DomainModule = {
  basePath: '/admin/catalog-requests',
  router: createCatalogRequestsRoutes(new CatalogRequestsController(catalogRequestsService)),
  registerDocs: registerCatalogRequestsDocs,
};
