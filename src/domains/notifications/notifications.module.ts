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
import { NotificationsController } from './notifications.controller';
import { createNotificationsRoutes } from './notifications.routes';
import { registerNotificationsDocs } from './notifications.swagger';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { PrismaNotificationPreferencesRepository } from './notification-preferences.repository';
import { createNotificationPreferencesRoutes } from './notification-preferences.routes';
import { NotificationPreferencesService } from './notification-preferences.service';
import { registerNotificationPreferencesDocs } from './notification-preferences.swagger';
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

export const notificationsModule: DomainModule = {
  basePath: '/notifications',
  router: createNotificationsRoutes(new NotificationsController(notificationsService)),
  registerDocs: registerNotificationsDocs,
};

export const notificationPreferencesModule: DomainModule = {
  basePath: '/me/notification-preferences',
  router: createNotificationPreferencesRoutes(
    new NotificationPreferencesController(notificationPreferencesService),
  ),
  registerDocs: registerNotificationPreferencesDocs,
};
