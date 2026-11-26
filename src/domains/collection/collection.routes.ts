import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CollectionController } from './collection.controller';

export function createCollectionRoutes(controller: CollectionController): Router {
  const router = Router();

  router.use(authenticate, authorize('CUSTOMER', 'SELLER'));
  router.get('/me/summary', controller.getSummary);
  router.get('/me/cards', controller.listCards);

  return router;
}
