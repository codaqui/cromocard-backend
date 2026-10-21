import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok } from '@/shared/utils/http-response';

import type { SettingsService } from './settings.service';
import { homeBannerSchema } from './settings.validator';

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  getHomeBanner = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.settingsService.getHomeBanner());
  };

  updateHomeBanner = async (req: Request, res: Response): Promise<void> => {
    const { id } = getAuthenticatedUser(req);
    ok(res, await this.settingsService.updateHomeBanner(homeBannerSchema.parse(req.body), id));
  };
}
