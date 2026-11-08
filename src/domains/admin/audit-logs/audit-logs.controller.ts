import type { Request, Response } from 'express';

import { ok, paginated } from '@/shared/utils/http-response';

import type { AuditLogService } from './audit-logs.service';
import { auditLogIdParamSchema, listAuditLogsQuerySchema } from './audit-logs.validator';

export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const filters = listAuditLogsQuerySchema.parse(req.query);
    const { items, meta } = await this.auditLogService.list(filters);
    paginated(res, items, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = auditLogIdParamSchema.parse(req.params);
    ok(res, await this.auditLogService.getById(id));
  };
}
