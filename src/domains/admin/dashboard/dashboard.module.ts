import { settingsService } from '@/domains/admin/settings/settings.module';
import { catalogService } from '@/domains/catalog/catalog.module';
import { usersService } from '@/domains/users/users.module';
import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { DashboardController } from './dashboard.controller';
import { PrismaDashboardRepository } from './dashboard.repository';
import { createDashboardRoutes } from './dashboard.routes';
import { DashboardService } from './dashboard.service';
import { registerDashboardDocs } from './dashboard.swagger';

const dashboardService = new DashboardService({
  users: usersService,
  catalog: catalogService,
  repository: new PrismaDashboardRepository(prisma),
  goals: settingsService,
  now: () => new Date(),
});

export const dashboardModule: DomainModule = {
  basePath: '/admin/dashboard',
  router: createDashboardRoutes(new DashboardController(dashboardService)),
  registerDocs: registerDashboardDocs,
};

export { dashboardService };
