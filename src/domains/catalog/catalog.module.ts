import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { PrismaAlbumsRepository } from './albums.repository';
import { PrismaCardsRepository } from './cards.repository';
import { CatalogController } from './catalog.controller';
import { createCatalogRoutes } from './catalog.routes';
import { CatalogService } from './catalog.service';
import { registerCatalogDocs } from './catalog.swagger';
import { PrismaCatalogImportRepository } from './catalog-import.repository';
import { CatalogImportService } from './catalog-import.service';
import { PrismaCategoriesRepository } from './categories.repository';
import { PrismaReferencesRepository } from './references.repository';

const catalogService = new CatalogService({
  albums: new PrismaAlbumsRepository(prisma),
  cards: new PrismaCardsRepository(prisma),
  categories: new PrismaCategoriesRepository(prisma),
  references: new PrismaReferencesRepository(prisma),
  auditLog: auditLogService,
});

const catalogImportService = new CatalogImportService(
  new PrismaCatalogImportRepository(prisma),
  auditLogService,
);

export const catalogModule: DomainModule = {
  basePath: '/admin/catalog',
  router: createCatalogRoutes(new CatalogController(catalogService, catalogImportService)),
  registerDocs: registerCatalogDocs,
};

export { catalogService };
