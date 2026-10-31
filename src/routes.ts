import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { env } from '@/config/env';
import { buildOpenApiDocument } from '@/config/swagger';
import { authModule } from '@/domains/auth/auth.module';
import { catalogModule } from '@/domains/catalog/catalog.module';
import { dashboardModule } from '@/domains/admin/dashboard/dashboard.module';
import { reportsModule } from '@/domains/admin/reports/reports.module';
import { settingsModule } from '@/domains/admin/settings/settings.module';
import { uploadsModule } from '@/domains/uploads/uploads.module';
import { usersModule } from '@/domains/users/users.module';
import type { DomainModule } from '@/shared/types/domain-module';

const API_PREFIX = '/api/v1';

const sharedModules: DomainModule[] = [
  authModule,
  usersModule,
  dashboardModule,
  catalogModule,
  reportsModule,
  settingsModule,
];

export interface RoutesOptions {
  /** Só a API recebe upload; o serviço de tempo real (ws) não monta a rota nem o storage. */
  withUploads: boolean;
}

export function createRoutes({ withUploads }: RoutesOptions): Router {
  const domainModules = withUploads ? [...sharedModules, uploadsModule] : sharedModules;
  const routes = Router();

  domainModules.forEach(({ basePath, router }) => routes.use(`${API_PREFIX}${basePath}`, router));
  if (env.NODE_ENV !== 'production') {
    routes.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument(domainModules)));
  }

  return routes;
}
