import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { prisma } from '@/lib/prisma';
import { socketEmitter } from '@/lib/socket-emitter';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { GlobalNotificationsController } from './global-notifications.controller';
import { PrismaGlobalNotificationsRepository } from './global-notifications.repository';
import { createGlobalNotificationsRoutes } from './global-notifications.routes';
import { GlobalNotificationsService } from './global-notifications.service';
import { registerGlobalNotificationsDocs } from './global-notifications.swagger';
import { NotificationPublisher } from './notification.publisher';
import { PrismaNotificationPreferencesRepository } from './notification-preferences.repository';
import { NotificationPreferencesService } from './notification-preferences.service';
import { PrismaNotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';

export const notificationPreferencesService = new NotificationPreferencesService(
  new PrismaNotificationPreferencesRepository(prisma),
);

export const notificationsService = new NotificationsService({
  repository: new PrismaNotificationsRepository(prisma),
  preferences: notificationPreferencesService,
  publisher: new NotificationPublisher(socketEmitter, logger),
});

export const globalNotificationsService = new GlobalNotificationsService({
  repository: new PrismaGlobalNotificationsRepository(prisma),
  auditLog: auditLogService,
  mail: mailProvider,
  logger,
  frontendUrl: env.FRONTEND_URL,
  realtime: notificationsService,
});

export const globalNotificationsModule: DomainModule = {
  basePath: '/global-notifications',
  router: createGlobalNotificationsRoutes(
    new GlobalNotificationsController(globalNotificationsService),
  ),
  registerDocs: registerGlobalNotificationsDocs,
};
