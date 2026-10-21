import { prisma } from '@/lib/prisma';
import type { DomainModule } from '@/shared/types/domain-module';

import { AuditLogsController } from './audit-logs.controller';
import { PrismaAuditLogsRepository } from './audit-logs.repository';
import { createAuditLogsRoutes } from './audit-logs.routes';
import { AuditLogsService } from './audit-logs.service';
import { registerAuditLogsDocs } from './audit-logs.swagger';

const auditLogsRepository = new PrismaAuditLogsRepository(prisma);
const auditLogsService = new AuditLogsService(auditLogsRepository);
const auditLogsController = new AuditLogsController(auditLogsService);

export const auditLogsModule: DomainModule = {
  basePath: '/admin/audit-logs',
  router: createAuditLogsRoutes(auditLogsController),
  registerDocs: registerAuditLogsDocs,
};

export { auditLogsService };
export type { AuditLogRecorder } from './audit-logs.service';
export type { AuditEntry, AuditTransaction } from './audit-logs.repository';
