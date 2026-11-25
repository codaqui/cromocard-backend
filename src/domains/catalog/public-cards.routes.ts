import { Router } from 'express';

import { authenticate } from '@/shared/middlewares/authenticate';

import type { PublicCardsController } from './public-cards.controller';

export function createPublicCardsRoutes(controller: PublicCardsController): Router {
  const router = Router();

  router.get('/', authenticate, controller.searchCards);

  return router;
}

export function createCardConditionsRoutes(controller: PublicCardsController): Router {
  const router = Router();

  router.get('/', authenticate, controller.listConditions);

  return router;
}
