import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { env } from '@/config/env';
import { TooManyRequestsError } from '@/shared/errors/http-errors';

const ONE_MINUTE_IN_MS = 60 * 1000;

export interface RateLimitOptions {
  limitPerMinute: number;
  keyByBodyField?: string;
  enabled?: boolean;
}

function clientKey(req: Request, bodyField?: string): string {
  const ip = ipKeyGenerator(req.ip ?? '');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const fieldValue = bodyField ? body[bodyField] : undefined;
  return typeof fieldValue === 'string' ? `${ip}:${fieldValue.trim().toLowerCase()}` : ip;
}

export function rateLimitPerMinute({
  limitPerMinute,
  keyByBodyField,
  enabled = env.NODE_ENV !== 'test',
}: RateLimitOptions): RequestHandler {
  return rateLimit({
    windowMs: ONE_MINUTE_IN_MS,
    limit: limitPerMinute,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !enabled,
    keyGenerator: (req) => clientKey(req, keyByBodyField),
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  });
}
