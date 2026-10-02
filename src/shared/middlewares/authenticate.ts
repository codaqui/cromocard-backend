import type { Request, RequestHandler } from 'express';

import { verifyAccessToken } from '@/lib/jwt';
import { UnauthorizedError } from '@/shared/errors/http-errors';
import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

const BEARER_PREFIX = 'Bearer ';

export const authenticate: RequestHandler = (req, _res, next) => {
  const authorization = req.headers.authorization ?? '';

  if (!authorization.startsWith(BEARER_PREFIX)) {
    throw new UnauthorizedError();
  }

  req.user = verifyAccessToken(authorization.slice(BEARER_PREFIX.length));
  next();
};

export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new UnauthorizedError();
  }

  return req.user;
}
