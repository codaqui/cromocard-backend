import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { SellerListingsController } from './seller-listings.controller';

export function createSellerListingsRoutes(controller: SellerListingsController): Router {
  const router = Router();

  router.use(authenticate, authorize('SELLER'));
  router.get('/eligibility', controller.getEligibility);
  router.post('/', controller.create);

  return router;
}
