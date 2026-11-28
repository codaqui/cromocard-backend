import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { NotificationsController } from './notifications.controller';

export function createNotificationsRoutes(controller: NotificationsController): Router {
  const router = Router();

  router.use(authenticate, authorize('CUSTOMER', 'SELLER'));
  router.get('/', controller.list);
  router.patch('/:id/read', controller.markAsRead);

  return router;
}
