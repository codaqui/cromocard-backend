import type { Request, Response } from 'express';

import { ok, paginated } from '@/shared/utils/http-response';

import type { AuditLogsService } from './audit-logs.service';
import { auditLogIdParamsSchema, listAuditLogsQuerySchema } from './audit-logs.validator';

export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.auditLogsService.list(
      listAuditLogsQuerySchema.parse(req.query),
    );
    paginated(res, items, meta);
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = auditLogIdParamsSchema.parse(req.params);
    ok(res, await this.auditLogsService.findById(id));
  };
}
