import type { Request, Response } from 'express';

import { ok, paginated } from '@/shared/utils/http-response';

import type { DashboardService } from './dashboard.service';
import { dashboardQuerySchema, recentSellersQuerySchema } from './dashboard.validator';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.dashboardService.getSummary(dashboardQuerySchema.parse(req.query)));
  };

  listRecentSellers = async (req: Request, res: Response): Promise<void> => {
    const query = recentSellersQuerySchema.parse(req.query);
    const { items, meta } = await this.dashboardService.listRecentSellers(query);
    paginated(res, items, meta);
  };
}
