import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { FinanceController } from './finance.controller';

export function createFinanceRoutes(controller: FinanceController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/summary', controller.getSummary);
  router.get('/ledger', controller.getLedger);
  router.get('/sellers', controller.sellerStats);
  router.get('/cards', controller.cardStats);
  router.get('/groups', controller.groupStats);

  return router;
}
