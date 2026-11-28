import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { NotificationPreferencesController } from './notification-preferences.controller';

export function createNotificationPreferencesRoutes(
  controller: NotificationPreferencesController,
): Router {
  const router = Router();

  router.use(authenticate, authorize('CUSTOMER', 'SELLER'));
  router.get('/', controller.get);
  router.put('/', controller.save);
  router.delete('/', controller.restore);

  return router;
}
