import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok } from '@/shared/utils/http-response';

import type { NotificationPreferencesService } from './notification-preferences.service';
import { notificationPreferencesSchema } from './notification-preferences.validator';

export class NotificationPreferencesController {
  constructor(private readonly service: NotificationPreferencesService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.get(getAuthenticatedUser(req).id));
  };

  save = async (req: Request, res: Response): Promise<void> => {
    const preferences = notificationPreferencesSchema.parse(req.body);
    ok(res, await this.service.save(getAuthenticatedUser(req).id, preferences));
  };

  restore = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.restore(getAuthenticatedUser(req).id));
  };
}
