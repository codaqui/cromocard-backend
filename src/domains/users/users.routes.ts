import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { UsersController } from './users.controller';

export function createUsersRoutes(controller: UsersController): Router {
  const router = Router();

  router.use(authenticate);
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  router.delete('/me', controller.deleteMe);

  router.use(authorize('ADMIN'));
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.getById);
  router.patch('/:id', controller.update);
  router.post('/:id/suspend', controller.suspend);
  router.post('/:id/reactivate', controller.reactivate);
  router.delete('/:id', controller.remove);

  return router;
}
