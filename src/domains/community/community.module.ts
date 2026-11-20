import { auditLogService } from '@/domains/admin/audit-logs/audit-logs.module';
import { authService } from '@/domains/auth/auth.module';
import { createSanctionsService } from '@/domains/users/users.module';
import { prisma } from '@/lib/prisma';
import { runInTransaction } from '@/lib/transaction';
import type { DomainModule } from '@/shared/types/domain-module';

import { CommunityAdminController } from './admin/community-admin.controller';
import { PrismaCommunityAdminRepository } from './admin/community-admin.repository';
import { createCommunityAdminRoutes } from './admin/community-admin.routes';
import { CommunityAdminService } from './admin/community-admin.service';
import { registerCommunityAdminDocs } from './admin/community-admin.swagger';

const communityAdminService = new CommunityAdminService({
  repository: new PrismaCommunityAdminRepository(prisma),
  auditLog: auditLogService,
  warner: createSanctionsService(authService),
  runInTransaction,
  now: () => new Date(),
});

export const communityAdminModule: DomainModule = {
  basePath: '/admin/community',
  router: createCommunityAdminRoutes(new CommunityAdminController(communityAdminService)),
  registerDocs: registerCommunityAdminDocs,
};

export { communityAdminService };
