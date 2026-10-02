import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { env } from '@/config/env';
import { httpLogger } from '@/config/logger';
import { routes } from '@/routes';
import { errorHandler, notFoundHandler } from '@/shared/errors/error-handler';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json());
  app.use(httpLogger);
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
