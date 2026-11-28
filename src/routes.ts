import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';

import { API_PREFIX } from '@/config/api';
import { env } from '@/config/env';
import { buildOpenApiDocument } from '@/config/swagger';
import { chatModule } from '@/domains/chat/chat.module';
import { authModule, authService } from '@/domains/auth/auth.module';
import { cardsModule } from '@/domains/catalog/cards/cards.module';
import { catalogModule } from '@/domains/catalog/catalog.module';
import { catalogRequestVotesModule } from '@/domains/catalog/requests/catalog-request-votes.module';
import { catalogRequestsModule } from '@/domains/catalog/requests/catalog-requests.module';
import { collectionModule } from '@/domains/collection/collection.module';
import { dashboardModule } from '@/domains/admin/dashboard/dashboard.module';
import { financeModule } from '@/domains/admin/finance/finance.module';
import { reportsModule } from '@/domains/admin/reports/reports.module';
import { publicSettingsModule, settingsModule } from '@/domains/admin/settings/settings.module';
import { communityAdminModule } from '@/domains/community/community.module';
import { uploadsModule } from '@/domains/uploads/uploads.module';
import { globalNotificationsModule } from '@/domains/notifications/notifications.module';
import {
  connectedAccountsModule,
  paymentsWebhookModule,
} from '@/domains/marketplace/payments/payments.module';
import { createUsersModule } from '@/domains/users/users.module';
import type { DomainModule } from '@/shared/types/domain-module';
import { auditLogsModule } from '@/domains/admin/audit-logs/audit-logs.module';
import { sellerVerificationsModule } from '@/domains/admin/seller-verifications/seller-verifications.module';

const sharedModules: DomainModule[] = [
  authModule,
  createUsersModule(authService),
  dashboardModule,
  financeModule,
  catalogModule,
  cardsModule,
  catalogRequestsModule,
  catalogRequestVotesModule,
  collectionModule,
  reportsModule,
  settingsModule,
  publicSettingsModule,
  auditLogsModule,
  communityAdminModule,
  globalNotificationsModule,
  sellerVerificationsModule,
  chatModule,
  connectedAccountsModule,
  paymentsWebhookModule,
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
