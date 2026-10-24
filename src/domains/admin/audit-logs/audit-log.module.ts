import { prisma } from '@/lib/prisma';

import { PrismaAuditLogRepository } from './audit-log.repository';
import { AuditLogService } from './audit-log.service';

const auditLogRepository = new PrismaAuditLogRepository(prisma);
const auditLogService = new AuditLogService(auditLogRepository);

export { auditLogService };
