import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';

import type { CardOptionsController } from './card-options.controller';

export function createCardOptionsRoutes(controller: CardOptionsController): Router {
  const router = Router();

  router.get('/', authenticate, controller.searchCards);

  return router;
}

export function createCardConditionsRoutes(controller: CardOptionsController): Router {
  const router = Router();

  router.get('/', authenticate, controller.listConditions);

  return router;
}
