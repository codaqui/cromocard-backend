import { Router } from 'express';

import type { ReferenceDataController } from './reference-data.controller';

export function createReferenceDataRoutes(controller: ReferenceDataController): Router {
  const router = Router();

  router.get('/rarities', controller.listRarities);
  router.get('/languages', controller.listLanguages);

  return router;
}
