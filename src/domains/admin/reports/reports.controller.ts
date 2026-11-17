import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { download, okWithMeta } from '@/shared/utils/http-response';

import type { ReportsService } from './reports.service';
import { exportQuerySchema, previewQuerySchema, reportTypeParamSchema } from './reports.validator';

export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  preview = async (req: Request, res: Response): Promise<void> => {
    const { type } = reportTypeParamSchema.parse(req.params);
    const { total, ...report } = await this.reportsService.preview(
      type,
      previewQuerySchema.parse(req.query),
    );
    okWithMeta(res, report, { total });
  };

  export = async (req: Request, res: Response): Promise<void> => {
    const { type } = reportTypeParamSchema.parse(req.params);
    const query = exportQuerySchema.parse(req.query);
    const { id: adminId } = getAuthenticatedUser(req);
    download(res, await this.reportsService.export({ type, query, adminId }));
  };
}
