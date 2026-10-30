import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { errorHandler } from '@/shared/errors/error-handler';
import { rateLimitRequests } from '@/shared/middlewares/rate-limit';

function appWithLimit(options: Parameters<typeof rateLimitRequests>[0]) {
  const app = express();
  app.use(express.json());
  app.post('/login', rateLimitRequests(options), (_req, res) => {
    res.status(204).end();
  });
  app.use(errorHandler);
  return app;
}

function postLogin(app: express.Express, email = 'ana@cromocard.dev') {
  return request(app).post('/login').send({ email });
}

describe('rateLimitRequests', () => {
  it('CA8: responde 429 TOO_MANY_REQUESTS quando o mesmo IP passa do limite', async () => {
    const app = appWithLimit({ limit: 2, keyByBodyField: 'email', enabled: true });

    await postLogin(app).expect(204);
    await postLogin(app).expect(204);
    const res = await postLogin(app);

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'TOO_MANY_REQUESTS' });
  });

  it('conta separado por e-mail no mesmo IP', async () => {
    const app = appWithLimit({ limit: 1, keyByBodyField: 'email', enabled: true });

    await postLogin(app, 'ana@cromocard.dev').expect(204);
    await postLogin(app, 'bia@cromocard.dev').expect(204);
    await postLogin(app, ' ANA@cromocard.dev ').expect(429);
  });

  it('fica desligado nos testes, como pede o ADR-049', async () => {
    const app = appWithLimit({ limit: 1 });

    await postLogin(app).expect(204);
    await postLogin(app).expect(204);
  });
});
