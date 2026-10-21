import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { AlbumsController } from './albums.controller';

export function createAlbumsRoutes(controller: AlbumsController): Router {
  const router = Router();
  const adminOnly = [authenticate, authorize('ADMIN')];

  router.get('/', controller.list);
  router.get('/:id', controller.getById);
  router.post('/', ...adminOnly, controller.create);
  router.patch('/:id', ...adminOnly, controller.update);
  router.delete('/:id', ...adminOnly, controller.remove);

  return router;
}
