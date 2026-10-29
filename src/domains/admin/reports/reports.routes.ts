import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

export function createReportsRoutes(): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));

  return router;
}
