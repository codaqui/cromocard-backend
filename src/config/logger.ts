import { randomUUID } from 'node:crypto';

import { pino } from 'pino';
import { pinoHttp } from 'pino-http';

import { env } from '@/config/env';

const prettyTransport = { target: 'pino-pretty', options: { colorize: true } };

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
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
