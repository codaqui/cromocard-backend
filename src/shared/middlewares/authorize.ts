import type { RequestHandler } from 'express';

import { ForbiddenError, UnauthorizedError } from '@/shared/errors/http-errors';
import type { UserRole } from '@/shared/types/authenticated-user';

export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      throw new UnauthorizedError();
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError();
    }

    next();
  };
}
