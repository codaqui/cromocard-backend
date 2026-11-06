import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { DashboardController } from './dashboard.controller';

export function createDashboardRoutes(controller: DashboardController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.getSummary);
  router.get('/recent-sellers', controller.listRecentSellers);

  return router;
}
