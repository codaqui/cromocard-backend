import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { collectionService } from '@/domains/collection/collection.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { PrismaAlbumsRepository } from './catalog-albums.repository';
import { PrismaCardsRepository } from './catalog-cards.repository';
import { CatalogController } from './catalog.controller';
import { createCatalogRoutes } from './catalog.routes';
import { CatalogService } from './catalog.service';
import { registerCatalogDocs } from './catalog.swagger';
import { PrismaCatalogImportRepository } from './catalog-import.repository';
import { CatalogImportService } from './catalog-import.service';
import { PrismaCategoriesRepository } from './catalog-categories.repository';
import { PrismaCategoryCardCounts } from './catalog-category-counts.repository';
import { PrismaDefaultCategoriesRepository } from './catalog-default-categories.repository';
import { DefaultCategoriesService } from './catalog-default-categories.service';
import { PrismaReferencesRepository } from './catalog-references.repository';
import { CardsBulkDeleteService } from './catalog-bulk-delete.service';
import { PrismaCatalogSummaryRepository } from './catalog-summary.repository';

const cardCounts = new PrismaCategoryCardCounts(prisma);
const cards = new PrismaCardsRepository(prisma);

const catalogService = new CatalogService({
  albums: new PrismaAlbumsRepository(prisma),
  cards,
  categories: new PrismaCategoriesRepository(prisma),
  cardCounts,
  references: new PrismaReferencesRepository(prisma),
  auditLog: auditLogService,
  summary: new PrismaCatalogSummaryRepository(prisma),
  cardUsage: collectionService,
});

const bulkDeleteService = new CardsBulkDeleteService({
  cards,
  auditLog: auditLogService,
  cardUsage: collectionService,
  runInTransaction,
});

const catalogImportService = new CatalogImportService(
  new PrismaCatalogImportRepository(prisma),
  auditLogService,
);

export const catalogModule: DomainModule = {
  basePath: '/admin/catalog',
  router: createCatalogRoutes(
    new CatalogController(catalogService, catalogImportService, bulkDeleteService),
  ),
  registerDocs: registerCatalogDocs,
};

const defaultCategoriesService = new DefaultCategoriesService(
  new PrismaDefaultCategoriesRepository(prisma),
  cardCounts,
);

export { cardCounts, catalogService, defaultCategoriesService };
