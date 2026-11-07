import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { CommunityAdminController } from './community-admin.controller';

function createGroupsRoutes(controller: CommunityAdminController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.listGroups);
  router.get('/summary', controller.getSummary);
  router.get('/:id', controller.getGroup);
  router.post('/:id/suspend', controller.suspendGroup);
  router.post('/:id/reactivate', controller.reactivateGroup);
  router.delete('/:id', controller.deleteGroup);

  return router;
}

function createModerationRoutes(controller: CommunityAdminController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/group-messages', controller.listGroupMessageReports);
  router.post('/:id/remove-message', controller.removeReportedMessage);
  router.post('/:id/dismiss', controller.dismissReport);

  return router;
}

export function createCommunityAdminRoutes(controller: CommunityAdminController): Router {
  const router = Router();

  router.use('/groups', createGroupsRoutes(controller));
  router.use('/reports', createModerationRoutes(controller));

  return router;
}
