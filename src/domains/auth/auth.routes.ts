import cookieParser from 'cookie-parser';
import { Router } from 'express';

import { rateLimitRequests } from '@/shared/middlewares/rate-limit';

import type { AuthController } from './auth.controller';

const loginLimit = { limit: 5 };
const registerLimit = { limit: 10, windowInMinutes: 60 };
const resendLimit = { limit: 3, windowInMinutes: 15, keyByBodyField: 'email' };

export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.use(cookieParser());
  router.post(
    '/login',
    rateLimitRequests({ ...loginLimit, keyByBodyField: 'email' }),
    controller.login,
  );
  router.post('/google', rateLimitRequests(loginLimit), controller.loginWithGoogle);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/register', rateLimitRequests(registerLimit), controller.register);
  router.post('/verify-email', controller.verifyEmail);
  router.post(
    '/verify-email/resend',
    rateLimitRequests(resendLimit),
    controller.resendVerification,
  );

  return router;
}
