import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { download, okWithMeta, paginated } from '@/shared/utils/http-response';

import type { ReportExportsService } from './report-exports.service';
import type { ReportsService } from './reports.service';
import {
  exportIdParamSchema,
  exportQuerySchema,
  exportsQuerySchema,
  previewQuerySchema,
  reportTypeParamSchema,
} from './reports.validator';

export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly reportExportsService: ReportExportsService,
  ) {}

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

  listExports = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.reportExportsService.list(
      exportsQuerySchema.parse(req.query),
    );
    paginated(res, items, meta);
  };

  downloadExport = async (req: Request, res: Response): Promise<void> => {
    const { id } = exportIdParamSchema.parse(req.params);
    download(res, await this.reportExportsService.getFile(id));
  };
}
