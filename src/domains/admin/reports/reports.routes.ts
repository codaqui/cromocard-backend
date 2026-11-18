import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { ReportsController } from './reports.controller';

export function createReportsRoutes(controller: ReportsController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/exports', controller.listExports);
  router.get('/exports/:id/file', controller.downloadExport);
  router.get('/:type', controller.preview);
  router.get('/:type/export', controller.export);

  return router;
}
