import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';

import { PrismaAlbumsRepository } from './albums.repository';
import { PrismaCardsRepository } from './cards.repository';
import { CatalogService } from './catalog.service';
import { PrismaCategoriesRepository } from './categories.repository';
import { PrismaReferencesRepository } from './references.repository';

const catalogService = new CatalogService({
  albums: new PrismaAlbumsRepository(prisma),
  cards: new PrismaCardsRepository(prisma),
  categories: new PrismaCategoriesRepository(prisma),
  references: new PrismaReferencesRepository(prisma),
  auditLog: auditLogService,
});

export { catalogService };
