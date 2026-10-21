import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { DashboardController } from './dashboard.controller';
import { PrismaDashboardRepository } from './dashboard.repository';
import { createDashboardRoutes } from './dashboard.routes';
import { DashboardService } from './dashboard.service';
import { registerDashboardDocs } from './dashboard.swagger';

const dashboardService = new DashboardService(new PrismaDashboardRepository(prisma));

export const dashboardModule: DomainModule = {
  basePath: '/admin/dashboard',
  router: createDashboardRoutes(new DashboardController(dashboardService)),
  registerDocs: registerDashboardDocs,
};
