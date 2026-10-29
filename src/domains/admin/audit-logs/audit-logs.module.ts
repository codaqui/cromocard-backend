import { prisma } from '@/lib/prisma';

import { PrismaAuditLogRepository } from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';

const auditLogRepository = new PrismaAuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditLogRepository);

export { auditLogService };
