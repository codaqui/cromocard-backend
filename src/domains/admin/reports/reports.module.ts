import type { DomainModule } from '@/shared/types/domain-module';

import { createReportsRoutes } from './reports.routes';
import { registerReportsDocs } from './reports.swagger';

export const reportsModule: DomainModule = {
  basePath: '/admin/reports',
  router: createReportsRoutes(),
  registerDocs: registerReportsDocs,
};
