import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { UploadsController } from './uploads.controller';

export function createUploadsRoutes(controller: UploadsController): Router {
  const router = Router();

  router.post('/', authenticate, authorize('ADMIN'), controller.upload);

  return router;
}
