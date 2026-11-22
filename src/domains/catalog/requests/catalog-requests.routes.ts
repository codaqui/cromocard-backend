import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CatalogRequestsController } from './catalog-requests.controller';

export function createCatalogRequestsRoutes(controller: CatalogRequestsController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.list);
  router.get('/:id', controller.find);
  router.get('/:id/checklist.csv', controller.checklist);
  router.post('/:id/approve', controller.approve);
  router.post('/:id/reject', controller.reject);

  return router;
}
