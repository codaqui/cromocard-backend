import type { RequestHandler } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthController } from '@/domains/auth/auth.controller';

const rateLimitCalls: unknown[] = [];

vi.mock('@/shared/middlewares/rate-limit', () => ({
  rateLimitRequests: (options: unknown) => {
    rateLimitCalls.push(options);
    const noop: RequestHandler = (_req, _res, next) => next();
    return noop;
  },
}));

const noopHandler: RequestHandler = (_req, res) => res.status(204).end();

function buildController(): AuthController {
  return {
    login: noopHandler,
    loginWithGoogle: noopHandler,
    refresh: noopHandler,
    logout: noopHandler,
    register: noopHandler,
    verifyEmail: noopHandler,
    resendVerification: noopHandler,
    forgotPassword: noopHandler,
    resetPassword: noopHandler,
  } as unknown as AuthController;
}

describe('createAuthRoutes', () => {
  beforeEach(() => {
    rateLimitCalls.length = 0;
    vi.resetModules();
  });

  it('limita o login pelo campo login (R10/CCD098), não mais pelo email', async () => {
    const { createAuthRoutes } = await import('@/domains/auth/auth.routes');

    createAuthRoutes(buildController());

    expect(rateLimitCalls[0]).toMatchObject({ keyByBodyField: 'login' });
  });
});
