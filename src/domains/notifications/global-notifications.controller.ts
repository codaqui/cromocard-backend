import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { created, ok, paginated } from '@/shared/utils/http-response';

import type { GlobalNotificationsService } from './global-notifications.service';
import {
  dispatchGlobalNotificationSchema,
  globalNotificationIdParamSchema,
  listGlobalNotificationsQuerySchema,
} from './global-notifications.validator';

export class GlobalNotificationsController {
  constructor(private readonly service: GlobalNotificationsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, meta } = await this.service.list(
      listGlobalNotificationsQuerySchema.parse(req.query),
    );
    paginated(res, items, meta);
  };

  recipientsCount = async (req: Request, res: Response): Promise<void> => {
    ok(res, await this.service.countRecipients(getAuthenticatedUser(req).id));
  };

  dispatch = async (req: Request, res: Response): Promise<void> => {
    const input = dispatchGlobalNotificationSchema.parse(req.body);
    created(res, await this.service.dispatch(getAuthenticatedUser(req).id, input));
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    const { id } = globalNotificationIdParamSchema.parse(req.params);
    ok(res, await this.service.cancel(id, getAuthenticatedUser(req).id));
  };
}
