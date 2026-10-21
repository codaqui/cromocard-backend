import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { AuditLogsController } from './audit-logs.controller';

export function createAuditLogsRoutes(controller: AuditLogsController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.list);
  router.get('/:id', controller.getById);

  return router;
}
