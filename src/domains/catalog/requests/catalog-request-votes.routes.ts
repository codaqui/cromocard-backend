import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CatalogRequestVotesController } from './catalog-request-votes.controller';

/** Clientes e vendedores votam; o admin decide e não vota (CCD103, L8). */
export function createCatalogRequestVotesRoutes(controller: CatalogRequestVotesController): Router {
  const router = Router();

  router.use(authenticate, authorize('CUSTOMER', 'SELLER'));
  router.get('/voting', controller.list);
  router.put('/:id/vote', controller.vote);

  return router;
}
