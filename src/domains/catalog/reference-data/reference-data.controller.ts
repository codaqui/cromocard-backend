import type { Request, Response } from 'express';

import { ok } from '@/shared/utils/http-response';

import type { ReferenceDataService } from './reference-data.service';

export class ReferenceDataController {
  constructor(private readonly referenceDataService: ReferenceDataService) {}

  listRarities = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.referenceDataService.listRarities());
  };

  listLanguages = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.referenceDataService.listLanguages());
  };
}
