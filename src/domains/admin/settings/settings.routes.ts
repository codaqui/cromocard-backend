import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';
import { authorize } from '@/shared/middlewares/authorize';

import type { SettingsController } from './settings.controller';

export function createSettingsRoutes(controller: SettingsController): Router {
  const router = Router();

  router.get('/home-banner', controller.getHomeBanner);
  router.put('/home-banner', authenticate, authorize('ADMIN'), controller.updateHomeBanner);

  return router;
}
