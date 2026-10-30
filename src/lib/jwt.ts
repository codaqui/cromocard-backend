import jwt from 'jsonwebtoken';

import { env } from '@/config/env';
import { z } from '@/lib/zod';
import { UnauthorizedError } from '@/shared/errors/http-errors';
import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

const accessTokenPayloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['CUSTOMER', 'SELLER', 'ADMIN']),
  purpose: z.never().optional(),
});

export function signAccessToken(user: AuthenticatedUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_ACCESS_TTL,
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
