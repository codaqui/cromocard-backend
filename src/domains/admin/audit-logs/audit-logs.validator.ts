import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { periodSchema } from '@/shared/utils/period';

import { auditActions } from './audit-logs.actions';

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  adminId: z.uuid().optional(),
  action: z.enum(auditActions).optional(),
  entityId: z.uuid().optional(),
  period: periodSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const auditLogIdParamsSchema = z.object({
  id: z.uuid(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
