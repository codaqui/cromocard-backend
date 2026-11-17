import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { SettingsController } from './settings.controller';

export function createSettingsRoutes(controller: SettingsController): Router {
  const router = Router();

  router.use(authenticate, authorize('ADMIN'));
  router.get('/', controller.list);
  router.get('/default-categories', controller.listDefaultCategories);
  router.patch('/default-categories', controller.updateDefaultCategories);
  router.patch('/goals', controller.updateGoals);
  router.patch('/:key', controller.update);

  return router;
}

export function createPublicSettingsRoutes(controller: SettingsController): Router {
  const router = Router();

  router.get('/:key', controller.getPublic);

  return router;
}
