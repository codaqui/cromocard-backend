import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { UsersController } from './users.controller';

export function createUsersRoutes(controller: UsersController): Router {
  const router = Router();

  router.use(authenticate);
  router.get('/', authorize('ADMIN'), controller.list);
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  router.delete('/me', controller.deleteMe);

  return router;
}
