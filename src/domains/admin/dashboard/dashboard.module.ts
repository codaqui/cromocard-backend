import { usersService } from '@/domains/users/users.module';
import type { DomainModule } from '@/shared/types/domain-module';

import { DashboardController } from './dashboard.controller';
import { createDashboardRoutes } from './dashboard.routes';
import { DashboardService } from './dashboard.service';
import { registerDashboardDocs } from './dashboard.swagger';

const dashboardService = new DashboardService({ users: usersService });

export const dashboardModule: DomainModule = {
  basePath: '/admin/dashboard',
  router: createDashboardRoutes(new DashboardController(dashboardService)),
  registerDocs: registerDashboardDocs,
};

export { dashboardService };
