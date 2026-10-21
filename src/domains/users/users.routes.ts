import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { UsersController } from './users.controller';

export function createUsersRoutes(controller: UsersController): Router {
  const router = Router();
  const adminOnly = authorize('ADMIN');

  router.use(authenticate);
  router.get('/', adminOnly, controller.list);
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  router.delete('/me', controller.deleteMe);

  router.post('/', adminOnly, controller.create);
  router.get('/:id', adminOnly, controller.getById);
  router.patch('/:id', adminOnly, controller.updateById);
  router.delete('/:id', adminOnly, controller.removeById);
  router.post('/:id/suspend', adminOnly, controller.suspend);
  router.post('/:id/reactivate', adminOnly, controller.reactivate);
  router.post('/:id/restore', adminOnly, controller.restore);

  return router;
}
