import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CategoriesController } from './categories.controller';

export function createCategoriesRoutes(controller: CategoriesController): Router {
  const router = Router();
  const adminOnly = [authenticate, authorize('ADMIN')];

  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.post('/', ...adminOnly, controller.create);
  router.patch('/:id', ...adminOnly, controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);
  router.post('/:id/move', ...adminOnly, controller.move);

  return router;
}
