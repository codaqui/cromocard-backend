import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { env } from '@/config/env';
import { buildOpenApiDocument } from '@/config/swagger';
import { auditLogsModule } from '@/domains/admin/audit-logs/audit-logs.module';
import { dashboardModule } from '@/domains/admin/dashboard/dashboard.module';
import { settingsModule } from '@/domains/admin/settings/settings.module';
import { authModule } from '@/domains/auth/auth.module';
import { albumsModule } from '@/domains/catalog/albums/albums.module';
import { cardsModule } from '@/domains/catalog/cards/cards.module';
import { categoriesModule } from '@/domains/catalog/categories/categories.module';
import { referenceDataModule } from '@/domains/catalog/reference-data/reference-data.module';
import { uploadsModule } from '@/domains/uploads/uploads.module';
import { usersModule } from '@/domains/users/users.module';
import type { DomainModule } from '@/shared/types/domain-module';

const API_PREFIX = '/api/v1';

const domainModules: DomainModule[] = [
  authModule,
  usersModule,
  categoriesModule,
  albumsModule,
  cardsModule,
  referenceDataModule,
  uploadsModule,
  settingsModule,
  auditLogsModule,
  dashboardModule,
];

export const routes = Router();

domainModules.forEach(({ basePath, router }) => routes.use(`${API_PREFIX}${basePath}`, router));

if (env.NODE_ENV !== 'production') {
  routes.use('/docs', swaggerUi.serve, swaggerUi.setup(buildOpenApiDocument(domainModules)));
}
