import { Router } from 'express';
import { authorize } from '@/shared/middlewares/authorize';
import { authenticate } from '@/shared/middlewares/authenticate';
import { FindAuditLogsFiltersSchema } from './audit-logs.validator';
import { PrismaAuditLogRepository } from './audit-logs.repository';
import { AuditLogService } from './audit-logs.service';
import { prisma } from '@/lib/prisma';

const auditLogRepository = new PrismaAuditLogRepository(prisma);
export const auditLogService = new AuditLogService(auditLogRepository);

const auditLogsRoutes = Router();

auditLogsRoutes.use(authenticate);
auditLogsRoutes.use(authorize('ADMIN'));

auditLogsRoutes.get('/', async (req, res, next) => {
    try {
        const filters = FindAuditLogsFiltersSchema.parse(req.query);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [data, total, last30Days] = await Promise.all([
            auditLogService.list(filters),
            auditLogService.count(filters),
            auditLogService.count({ from: thirtyDaysAgo.toISOString() })
        ]); 
        
        res.json({
            data,
            meta: {
                total,
                page: filters.page || 1,
                last30Days,
            }
        });
    } catch(error) {
        next(error);
    }
});

auditLogsRoutes.get('/:id', async (req, res, next) => {
    const { id } = req.params;
    const result = await auditLogService.getById(id).catch(next);
    
    if (result === undefined) {
        return;
    }
    
    if (result === null) {
        res.status(404).json({ message: 'AUDIT_LOG_NOT_FOUND' });
        return;
    }

    res.json(result);
});

export { auditLogsRoutes };