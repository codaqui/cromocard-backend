import { Router } from 'express';

export type PingDatabase = () => Promise<void>;

// /health é o healthcheck dos containers e do deploy (HEALTH_URL); /health/db confere o banco.
export function createHealthRoutes(pingDatabase?: PingDatabase): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.get('/health/db', (_req, res) => {
    if (!pingDatabase) {
      res.status(503).json({ status: 'error', database: 'not configured' });
      return;
    }
    void pingDatabase()
      .then(() => res.json({ status: 'ok', database: 'up' }))
      .catch(() => res.status(503).json({ status: 'error', database: 'down' }));
  });

  return router;
}
