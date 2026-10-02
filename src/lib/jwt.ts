import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { z } from '@/lib/zod';
import { UnauthorizedError } from '@/shared/errors/http-errors';
import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

const ACCESS_TOKEN_TTL_IN_SECONDS = 15 * 60;

const accessTokenPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['CUSTOMER', 'SELLER', 'ADMIN']),
});

export function signAccessToken(user: AuthenticatedUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_IN_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AuthenticatedUser {
  try {
    const payload = accessTokenPayloadSchema.parse(
      jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }),
    );
    return { id: payload.sub, role: payload.role };
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}
