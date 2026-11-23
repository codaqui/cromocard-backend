import { Router } from 'express';

import type { CardsController } from './cards.controller';

export function createCardsRoutes(controller: CardsController): Router {
  const router = Router();

  router.get('/:id', controller.getProfile);
  router.get('/:cardId/listings', controller.listListings);

  return router;
}
