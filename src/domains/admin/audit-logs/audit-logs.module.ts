import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { AuditLogsController } from './audit-logs.controller';
import { PrismaAuditLogRepository } from './audit-logs.repository';
import { createAuditLogsRoutes } from './audit-logs.routes';
import { AuditLogService } from './audit-logs.service';
import { registerAuditLogsDocs } from './audit-logs.swagger';

const auditLogRepository = new PrismaAuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditLogRepository);
const auditLogsController = new AuditLogsController(auditLogService);

export const auditLogsModule: DomainModule = {
  basePath: '/admin/audit-logs',
  router: createAuditLogsRoutes(auditLogsController),
  registerDocs: registerAuditLogsDocs,
};

export { auditLogService };
