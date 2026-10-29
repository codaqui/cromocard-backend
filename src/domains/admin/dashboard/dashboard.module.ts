import type { DomainModule } from '@/shared/types/domain-module';

import { createDashboardRoutes } from './dashboard.routes';
import { registerDashboardDocs } from './dashboard.swagger';

export const dashboardModule: DomainModule = {
  basePath: '/admin/dashboard',
  router: createDashboardRoutes(),
  registerDocs: registerDashboardDocs,
};
