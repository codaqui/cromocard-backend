import type { Request, Response } from 'express';

import { ok } from '@/shared/utils/http-response';

import type { DashboardService } from './dashboard.service';
import { dashboardQuerySchema } from './dashboard.validator';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.dashboardService.getSummary(dashboardQuerySchema.parse(req.query)));
  };
}
