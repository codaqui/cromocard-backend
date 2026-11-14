import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { SellerVerificationsController } from './seller-verifications.controller';

export function createSellerVerificationsRoutes(
  controller: SellerVerificationsController,
): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.list);
  router.get('/summary', controller.getSummary);
  router.get('/:id', controller.getById);
  router.post('/:id/documents/:documentId/validate', controller.validateDocument);
  router.post('/:id/notes', controller.addNote);
  router.post('/:id/approve', controller.approve);
  router.post('/:id/reject', controller.reject);

  return router;
}
