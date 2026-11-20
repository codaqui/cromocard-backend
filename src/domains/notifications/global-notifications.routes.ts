import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { GlobalNotificationsController } from './global-notifications.controller';

export function createGlobalNotificationsRoutes(controller: GlobalNotificationsController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.list);
  router.get('/recipients-count', controller.recipientsCount);
  router.post('/', controller.dispatch);
  router.post('/:id/cancel', controller.cancel);

  return router;
}
