import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

import { pino } from 'pino';
import type { Logger, stdSerializers } from 'pino';
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
  'login',
  'cpf',
  'phone',
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

export function transportFor(nodeEnv: string) {
  return nodeEnv === 'development' ? prettyTransport : undefined;
}

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: LOG_REDACT_PATHS,
  transport: transportFor(env.NODE_ENV),
});

export function stripQueryString(req: ReturnType<typeof stdSerializers.req>) {
  const [path] = (req.url ?? '').split('?');
  return { ...req, url: path, query: undefined };
}

interface RequestIdHeaders {
  headers: IncomingHttpHeaders;
}

export function requestIdFrom(req: RequestIdHeaders): string {
  return req.headers['x-request-id']?.toString() ?? randomUUID();
}

/** Logger de requisições: a query string sai do log porque a busca de usuários leva CPF no `q` (ADR-019, R14). */
export function createHttpLogger(baseLogger: Logger) {
  return pinoHttp({
    logger: baseLogger,
    genReqId: (req, res) => {
      const requestId = requestIdFrom(req);
      res.setHeader('X-Request-Id', requestId);
      return requestId;
    },
    serializers: { req: stripQueryString },
  });
}

export const httpLogger = createHttpLogger(logger);
