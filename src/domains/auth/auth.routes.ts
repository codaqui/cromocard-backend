import { Router } from 'express';

import type { AuthController } from './auth.controller';

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/password/setup', controller.setupPassword);

  return router;
}
