import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { GlobalNotificationsController } from './global-notifications.controller';
import { PrismaGlobalNotificationsRepository } from './global-notifications.repository';
import { createGlobalNotificationsRoutes } from './global-notifications.routes';
import { GlobalNotificationsService } from './global-notifications.service';
import { registerGlobalNotificationsDocs } from './global-notifications.swagger';
import { PrismaNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

export const notificationsService = new NotificationsService(
  new PrismaNotificationsRepository(prisma),
);

export const globalNotificationsService = new GlobalNotificationsService({
  repository: new PrismaGlobalNotificationsRepository(prisma),
  auditLog: auditLogService,
  mail: mailProvider,
  logger,
  frontendUrl: env.FRONTEND_URL,
});

export const globalNotificationsModule: DomainModule = {
  basePath: '/global-notifications',
  router: createGlobalNotificationsRoutes(
    new GlobalNotificationsController(globalNotificationsService),
  ),
  registerDocs: registerGlobalNotificationsDocs,
};
