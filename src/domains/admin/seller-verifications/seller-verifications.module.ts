import { logger } from '@/config/logger';
import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { settingsStore } from '@/domains/admin/settings/settings.module';
import { notificationsService } from '@/domains/notifications/notifications.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import { mailProvider } from '@/providers/mail/mail.factory';
import type { DomainModule } from '@/shared/types/domain-module';

import { PendingNoticeService } from './pending-notice.service';
import { SellerVerificationsController } from './seller-verifications.controller';
import { PrismaSellerVerificationsRepository } from './seller-verifications.repository';
import { createSellerVerificationsRoutes } from './seller-verifications.routes';
import { SellerVerificationsService } from './seller-verifications.service';
import { registerSellerVerificationsDocs } from './seller-verifications.swagger';

const sellerVerificationsRepository = new PrismaSellerVerificationsRepository(prisma);

const sellerVerificationsService = new SellerVerificationsService({
  repository: sellerVerificationsRepository,
  auditLogService,
  notifier: notificationsService,
  runInTransaction,
  now: () => new Date(),
});

const pendingNoticeService = new PendingNoticeService({
  repository: sellerVerificationsRepository,
  auditLogService,
  notifier: notificationsService,
  settings: settingsStore,
  mailer: mailProvider,
  logger,
  runInTransaction,
  now: () => new Date(),
});

export const sellerVerificationsModule: DomainModule = {
  basePath: '/admin/seller-verifications',
  router: createSellerVerificationsRoutes(
    new SellerVerificationsController(sellerVerificationsService, pendingNoticeService),
  ),
  registerDocs: registerSellerVerificationsDocs,
};

export { sellerVerificationsService };
