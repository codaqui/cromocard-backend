import { auditLogsService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { CategoriesController } from './categories.controller';
import { PrismaCategoriesRepository } from './categories.repository';
import { createCategoriesRoutes } from './categories.routes';
import { CategoriesService } from './categories.service';
import { registerCategoriesDocs } from './categories.swagger';

const categoriesService = new CategoriesService(
  new PrismaCategoriesRepository(prisma),
  auditLogsService,
);

export const categoriesModule: DomainModule = {
  basePath: '/categories',
  router: createCategoriesRoutes(new CategoriesController(categoriesService)),
  registerDocs: registerCategoriesDocs,
};

export { categoriesService };
