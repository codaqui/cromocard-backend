import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok } from '@/shared/utils/http-response';

import type { SettingsService } from './settings.service';
import {
  defaultCategoriesBodySchema,
  goalsBodySchema,
  parseSettingUpdate,
  settingKeyParamSchema,
} from './settings.validator';

function adminIdOf(req: Request): string {
  return getAuthenticatedUser(req).id;
}

export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.settingsService.list());
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const change = parseSettingUpdate(req.params, req.body);
    ok(res, await this.settingsService.update(change, adminIdOf(req)));
  };

  listDefaultCategories = async (_req: Request, res: Response): Promise<void> => {
    ok(res, await this.settingsService.listDefaultCategories());
  };

  updateDefaultCategories = async (req: Request, res: Response): Promise<void> => {
    const input = defaultCategoriesBodySchema.parse(req.body);
    ok(res, await this.settingsService.updateDefaultCategories(input, adminIdOf(req)));
  };

  updateGoals = async (req: Request, res: Response): Promise<void> => {
    const goals = goalsBodySchema.parse(req.body);
    ok(res, await this.settingsService.updateGoals(goals, adminIdOf(req)));
  };

  getPublic = async (req: Request, res: Response): Promise<void> => {
    const { key } = settingKeyParamSchema.parse(req.params);
    ok(res, await this.settingsService.getPublic(key));
  };
}
