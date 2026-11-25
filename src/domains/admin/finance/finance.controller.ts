import type { Request, Response } from 'express';

import { ok, okWithMeta } from '@/shared/utils/http-response';

import type { FinanceService } from './finance.service';
import { financeSummaryQuerySchema, idsQuerySchema, ledgerQuerySchema } from './finance.validator';

export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  getSummary = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.financeService.getSummary(financeSummaryQuerySchema.parse(req.query)));
  };

  getLedger = async (req: Request, res: Response): Promise<void> => {
    const { day, entries, meta } = await this.financeService.getLedger(
      ledgerQuerySchema.parse(req.query),
    );
    okWithMeta(res, entries, { ...meta, day });
  };

  sellerStats = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.financeService.sellerStats(idsQuerySchema.parse(req.query).ids));
  };

  cardStats = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.financeService.cardStats(idsQuerySchema.parse(req.query).ids));
  };

  groupStats = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.financeService.groupStats(idsQuerySchema.parse(req.query).ids));
  };
}
