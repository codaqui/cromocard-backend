import cookieParser from 'cookie-parser';
import { Router } from 'express';

import { rateLimitPerMinute } from '@/shared/middlewares/rate-limit';

import type { AuthController } from './auth.controller';

const LOGIN_ATTEMPTS_PER_MINUTE = 5;

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.use(cookieParser());
  router.post(
    '/login',
    rateLimitPerMinute({ limitPerMinute: LOGIN_ATTEMPTS_PER_MINUTE, keyByBodyField: 'email' }),
    controller.login,
  );
  router.post(
    '/google',
    rateLimitPerMinute({ limitPerMinute: LOGIN_ATTEMPTS_PER_MINUTE }),
    controller.loginWithGoogle,
  );
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);

  return router;
}
