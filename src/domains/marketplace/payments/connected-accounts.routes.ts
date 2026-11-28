import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { ConnectedAccountsController } from './connected-accounts.controller';

export function createConnectedAccountsRoutes(controller: ConnectedAccountsController): Router {
  const router = Router();

  router.use(authenticate, authorize('SELLER'));
  router.get('/', controller.get);
  router.post('/onboarding-link', controller.createOnboardingLink);
  router.post('/refresh', controller.refresh);

  return router;
}
