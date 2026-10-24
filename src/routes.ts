import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { env } from '@/config/env';
import { buildOpenApiDocument } from '@/config/swagger';
import { dashboardModule } from '@/domains/admin/dashboard/dashboard.module';
import { reportsModule } from '@/domains/admin/reports/reports.module';
import { settingsModule } from '@/domains/admin/settings/settings.module';
import { uploadsModule } from '@/domains/uploads/uploads.module';
import { usersModule } from '@/domains/users/users.module';
import type { DomainModule } from '@/shared/types/domain-module';

const API_PREFIX = '/api/v1';

const domainModules: DomainModule[] = [
  usersModule,
  uploadsModule,
  dashboardModule,
  reportsModule,
  settingsModule,
];

export const routes = Router();

domainModules.forEach(({ basePath, router }) => routes.use(`${API_PREFIX}${basePath}`, router));

if (env.NODE_ENV !== 'production') {
  routes.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument(domainModules)));
}
