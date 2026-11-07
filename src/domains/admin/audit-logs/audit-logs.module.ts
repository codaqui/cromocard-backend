import { prisma } from '@/lib/prisma';

import { PrismaAuditLogRepository } from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';
import { auditLogsRoutes } from './audit-logs.routes';

const auditLogRepository = new PrismaAuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditLogRepository);

export const auditLogsModule = {
    basePath: '/admin/audit-logs',
    router: auditLogsRoutes,
    registerDocs: () => {
        
    }
}

export { auditLogService };
