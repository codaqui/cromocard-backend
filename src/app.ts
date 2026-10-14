import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from '@/config/env';
import { httpLogger } from '@/config/logger';
import { routes } from '@/routes';
import { errorHandler, notFoundHandler } from '@/shared/errors/error-handler';
import { createHealthRoutes, type PingDatabase } from '@/shared/health/health.routes';

export interface AppDeps {
  /** Verifica a conexão com o banco. Os testes passam um falso; os servidores passam o real. */
  pingDatabase?: PingDatabase;
}

export function createApp(deps: AppDeps = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(httpLogger);
  app.use(createHealthRoutes(deps.pingDatabase));
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
