import { randomUUID } from 'node:crypto';

import { pino } from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from '@/config/env';

const prettyTransport = { target: 'pino-pretty', options: { colorize: true } };

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'idToken',
  'email',
  'cookie',
  'authorization',
];

export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: LOG_REDACT_PATHS,
  transport: env.NODE_ENV === 'development' ? prettyTransport : undefined,
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const requestId = req.headers['x-request-id']?.toString() ?? randomUUID();
    res.setHeader('X-Request-Id', requestId);
    return requestId;
  },
});
