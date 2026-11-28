import type { Request, Response } from 'express';

import { getAuthenticatedUser } from '@/shared/middlewares/authenticate';
import { ok, okWithMeta } from '@/shared/utils/http-response';

import type { NotificationsService } from './notifications.service';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './notifications.validator';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, nextCursor, counts } = await this.service.list(
      getAuthenticatedUser(req).id,
      listNotificationsQuerySchema.parse(req.query),
    );
    okWithMeta(res, items, { nextCursor, counts });
  };

  markAsRead = async (req: Request, res: Response): Promise<void> => {
    const { id } = notificationIdParamSchema.parse(req.params);
    ok(res, await this.service.markAsRead(getAuthenticatedUser(req).id, id));
  };
}
